import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/client'
import { tenantContext, type TenantContext } from '../core/tenant-context'
import { TENANT_TABLES, touchesTenantTable } from '../core/tenant-tables'

/**
 * Whether tenant isolation applies. DATABASE_URL is the API's connection, and when that is the restricted role
 * (scripts/create-app-role.ts) the policies bind it, so the API sets the caller's context on every query. Connected
 * as the owner or a superuser (tests, a fresh checkout, tooling) the policies are skipped and the API is the plain
 * client. The role is read once at startup; REQUIRE_TENANT_RLS=on makes startup fail if it is not the restricted one.
 * Migrations, the seed and the scripts use SCHEMA_DATABASE_URL (the owner), see scripts/lib/owner-env.ts.
 */
const state = { active: false }

/** A query that has not run yet. Runs when awaited, or as one step of an array `$transaction`. */
interface Lazy<T> extends PromiseLike<T> {
  readonly tenantStep: () => PromiseLike<unknown>
  catch: Promise<T>['catch']
  finally: Promise<T>['finally']
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  constructor() {
    super()
    // Every `this.prisma.*` call goes through the proxy; until startup finds the connection is the restricted
    // role it behaves exactly like the plain client.
    return tenantProxy(this) as PrismaService
  }

  async onModuleInit() {
    await this.$connect()
    const [row] = await this.$queryRawUnsafe<{ role: string; bypass: boolean }[]>(
      `SELECT r.rolname AS role,
         (r.rolsuper OR r.rolbypassrls OR EXISTS (
           SELECT 1 FROM pg_tables t
            WHERE t.schemaname = 'public' AND t.tablename = ANY($1::text[]) AND t.tableowner = r.rolname
         )) AS bypass
       FROM pg_roles r WHERE r.rolname = current_user`,
      [...TENANT_TABLES]
    )
    state.active = row?.bypass === false
    if (!state.active && process.env.REQUIRE_TENANT_RLS === 'on') {
      throw new Error(
        `REQUIRE_TENANT_RLS=on, but DATABASE_URL connects as ${row?.role}, which bypasses row-level security (superuser, BYPASSRLS or table owner). It must be the restricted role from scripts/create-app-role.ts.`
      )
    }
    if (state.active) {
      this.logger.log(`Row-level security on (connected as ${row.role})`)
    } else {
      const message = `Row-level security off (connected as ${row?.role}, which bypasses it)`
      if (process.env.NODE_ENV === 'production')
        this.logger.warn(`${message}: access control is the application's alone`)
      else this.logger.log(message)
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}

/**
 * The two settings Postgres policies read, as one statement. The caller's agencies are worked out inside that
 * statement by the database (from their grants, or all of them), so there is no separate lookup round trip
 * and a grant given or taken away applies to the next query.
 */
function setContext(db: PrismaClient, ctx: TenantContext) {
  const agencies = ctx.fixedAgencyIds
    ? Prisma.sql`${ctx.fixedAgencyIds.join(',')}`
    : ctx.allAgencies
      ? Prisma.sql`array_to_string("all_agency_ids"(), ',')`
      : ctx.userId
        ? Prisma.sql`array_to_string("agencies_of_user"(${ctx.userId}), ',')`
        : Prisma.sql`''`
  return db.$executeRaw(
    Prisma.sql`SELECT set_config('app.agency_ids', ${agencies}, true), set_config('app.user_id', ${ctx.userId ?? ''}, true)`
  )
}

function lazy<T>(run: () => PromiseLike<T>, step: () => PromiseLike<unknown>): Lazy<T> {
  let started: Promise<T> | undefined
  const start = () => (started ??= Promise.resolve(run()))
  return {
    // Inside an array $transaction the query runs as one of its steps, unless it already ran.
    tenantStep: () => started ?? step(),
    then: (ok, fail) => start().then(ok, fail),
    catch: (fail) => start().catch(fail),
    finally: (fn) => start().finally(fn),
  } as Lazy<T>
}

const isLazy = (v: unknown): v is Lazy<unknown> =>
  typeof v === 'object' && v !== null && 'tenantStep' in v

type Call = (...args: unknown[]) => PromiseLike<unknown>

/**
 * Wraps the client so every query runs with the caller's tenant settings. A query made on its own runs
 * in a short transaction that sets them first; a query made inside `$transaction` joins that
 * transaction. Without a context (no verified caller) the settings are empty and Postgres returns nothing.
 * The context is read when the query is written, not when it is awaited.
 */
function tenantProxy(db: PrismaClient): PrismaClient {
  /** A query that runs `call` with the context that is current now. */
  function deferred(call: Call, args: unknown[], model?: string): Lazy<unknown> {
    // A query that cannot reach a tenant table needs no context, so it skips the extra transaction.
    if (model && !touchesTenantTable(model, args[0])) {
      return lazy(
        () => call(...args),
        () => call(...args)
      )
    }
    const ctx = tenantContext() ?? {}
    return lazy(
      async () => {
        const [, result] = await db.$transaction([setContext(db, ctx), call(...args) as never])
        return result
      },
      () => call(...args)
    )
  }

  const rawMethods = ['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe']

  function model(name: string, delegate: Record<string, unknown>) {
    return new Proxy(delegate, {
      get(target, method: string) {
        const fn = target[method]
        if (typeof fn !== 'function') return fn
        return (...args: unknown[]) => deferred((fn as Call).bind(target), args, name)
      },
    })
  }

  return new Proxy(db, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown
      if (typeof prop !== 'string') return value
      // Not connected as the restricted role: behave exactly like the plain client.
      if (!state.active) return typeof value === 'function' ? (value as Call).bind(target) : value

      if (rawMethods.includes(prop)) {
        return (...args: unknown[]) => deferred((value as Call).bind(target), args)
      }

      if (prop === '$transaction') {
        return async (arg: unknown, options?: unknown) => {
          const ctx = tenantContext() ?? {}
          if (typeof arg === 'function') {
            // Interactive: settle the context first, then hand the caller the plain transaction client.
            return target.$transaction(async (tx) => {
              await setContext(tx as unknown as PrismaClient, ctx)
              return (arg as (t: unknown) => unknown)(tx)
            }, options as never)
          }
          const steps = (arg as unknown[]).map((q) => (isLazy(q) ? q.tenantStep() : q))
          const out = await target.$transaction(
            [setContext(target, ctx), ...steps] as never,
            options as never
          )
          return (out as unknown[]).slice(1)
        }
      }

      if (
        value &&
        typeof value === 'object' &&
        typeof (value as { findMany?: unknown }).findMany === 'function'
      ) {
        return model(prop[0].toUpperCase() + prop.slice(1), value as Record<string, unknown>)
      }
      return typeof value === 'function' ? (value as Call).bind(target) : value
    },
  })
}
