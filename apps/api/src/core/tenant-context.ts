import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Who a request acts as, for database-level tenant isolation (GitHub issue #84). PrismaService reads it
 * to set `app.user_id` and `app.agency_ids` on every query, and Postgres row-level security does the rest.
 *
 * A request opens an empty context (tenantMiddleware); the guard that verifies the caller fills it in with
 * `identifyCaller` before anything else touches the database. Nothing outside a request has a context, so
 * background work must say what it acts as (`runAsSystem`).
 */
export interface TenantContext {
  userId?: string
  /** Sees every agency: system administrators and trusted background work. */
  allAgencies?: boolean
  /** Agencies the caller is limited to when it is not a grants lookup (for example standalone Interview Differently). */
  fixedAgencyIds?: string[]
}

const store = new AsyncLocalStorage<TenantContext>()

export function tenantContext(): TenantContext | undefined {
  return store.getStore()
}

/** Opens a fresh, empty context for the work done inside `fn`. */
export function withTenantContext<T>(fn: () => T, initial: TenantContext = {}): T {
  return store.run({ ...initial }, fn)
}

/** Says who the current request acts as. Call it as soon as a guard has verified the caller. */
export function identifyCaller(who: {
  userId: string
  allAgencies?: boolean
  fixedAgencyIds?: string[]
}): void {
  const ctx = store.getStore()
  if (!ctx) return
  ctx.userId = who.userId
  ctx.allAgencies = who.allAgencies === true
  ctx.fixedAgencyIds = who.fixedAgencyIds
}

/** Runs `fn` seeing every agency. For audited, trusted code paths only (jobs, webhooks, join by code). */
export function runAsSystem<T>(fn: () => T): T {
  return store.run({ allAgencies: true }, fn)
}

/** Runs `fn` limited to one agency, with no signed-in person. For callers that proved the agency by a signature we issued. */
export function runAsAgency<T>(agencyId: string, fn: () => T): T {
  return store.run({ fixedAgencyIds: [agencyId] }, fn)
}
