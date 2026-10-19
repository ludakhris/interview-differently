/**
 * Creates (or updates) the restricted database role the API connects as, so row-level security binds it
 * (GitHub issue #84). PostgreSQL superusers and roles with BYPASSRLS skip every policy, so the API must
 * never connect as one. Run by hand as the database owner:
 *
 *   APP_ROLE_PASSWORD=... npx ts-node -r tsconfig-paths/register scripts/create-app-role.ts --confirm-host <host>
 *
 * The password travels in a SQL statement, so do not run this against a server that logs statements.
 *
 * The role may read and write the tables but cannot change the schema, and may execute only the functions listed
 * in src/core/app-role-grants.ts. Tables made later by migrations (run as the owner) get table grants through default
 * privileges; functions never do. Prints the connection string to
 * use as DATABASE_URL for the API (the owner then moves to SCHEMA_DATABASE_URL), with the password hidden.
 */
import './lib/owner-env'
import { PrismaClient } from '@prisma/client'
import { assertBypassesRls, requireHostConfirmation } from './lib/db-guard'
import { APPEND_ONLY_TABLES, APP_ROLE_FUNCTIONS } from '../src/core/app-role-grants'

const ROLE = process.env.APP_ROLE_NAME ?? 'ld_app'

async function main(): Promise<void> {
  requireHostConfirmation()
  const password = process.env.APP_ROLE_PASSWORD
  if (!password || password.length < 24) throw new Error('Set APP_ROLE_PASSWORD (24+ characters)')
  if (!/^[a-z_][a-z0-9_]*$/.test(ROLE)) throw new Error('APP_ROLE_NAME must be a plain identifier')
  const prisma = new PrismaClient()
  try {
    await assertBypassesRls(prisma)
    const [me] = await prisma.$queryRawUnsafe<{ current_user: string; db: string }[]>(
      `SELECT current_user, current_database() AS db`
    )
    const quoted = password.replace(/'/g, "''")
    const exists = await prisma.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}'`
    )
    if (exists.length && !process.argv.includes('--rotate')) {
      console.log(
        `Role ${ROLE} already exists: its password is left alone (pass --rotate to set APP_ROLE_PASSWORD, which changes what a running API must connect with). Privileges are refreshed.`
      )
    } else {
      await prisma.$executeRawUnsafe(
        `${exists.length ? 'ALTER' : 'CREATE'} ROLE ${ROLE} LOGIN PASSWORD '${quoted}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`
      )
    }
    await prisma.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${me.db}" TO ${ROLE}`)
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${ROLE}`)
    await prisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROLE}`
    )
    await prisma.$executeRawUnsafe(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ROLE}`
    )
    // Audit tables: add and read only (src/core/app-role-grants.ts).
    for (const table of APPEND_ONLY_TABLES) {
      await prisma.$executeRawUnsafe(`REVOKE UPDATE, DELETE, TRUNCATE ON "${table}" FROM ${ROLE}`)
    }
    // Functions: only the ones in src/core/app-role-grants.ts. Nothing is granted by default, so a function added
    // later is not callable by the API until it is listed there and this script is run again.
    await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ${ROLE}`)
    for (const fn of APP_ROLE_FUNCTIONS) {
      await prisma.$executeRawUnsafe(`GRANT EXECUTE ON FUNCTION ${fn} TO ${ROLE}`)
    }
    await prisma.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${ROLE}`
    )
    await prisma.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${ROLE}`
    )
    await prisma.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM ${ROLE}`
    )
    const url = new URL(process.env.DATABASE_URL as string)
    url.username = ROLE
    url.password = '***'
    console.log(
      `Role ${ROLE} ${exists.length ? 'updated' : 'created'} in ${me.db} (as ${me.current_user}).`
    )
    console.log(
      `Use this as DATABASE_URL for the API (keep the owner as SCHEMA_DATABASE_URL): ${url.toString().replace('%2A%2A%2A', '<password>')}`
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
