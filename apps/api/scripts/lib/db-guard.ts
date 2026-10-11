import type { PrismaClient } from '@prisma/client'

/** The database host in DATABASE_URL, without credentials. */
export function dbHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? '').host
  } catch {
    return '(DATABASE_URL is not set or not a URL)'
  }
}

/**
 * Stops a script that writes unless the person names the database it is about to change:
 * `--confirm-host <host>` must equal the host in DATABASE_URL. A script run with a production URL by mistake
 * then does nothing.
 */
export function requireHostConfirmation(): void {
  const host = dbHost()
  console.log(`Database host: ${host}`)
  const i = process.argv.indexOf('--confirm-host')
  if (i < 0 || process.argv[i + 1] !== host) {
    console.error(
      `This script changes data. Re-run with  --confirm-host ${host}  to confirm that is the database you mean.`
    )
    process.exit(2)
  }
}

/** Throws unless the connected role ignores row-level security (a superuser, BYPASSRLS, or the tables' owner). */
export async function assertBypassesRls(prisma: PrismaClient): Promise<void> {
  const [row] = await prisma.$queryRawUnsafe<{ ok: boolean }[]>(
    `SELECT (r.rolsuper OR r.rolbypassrls OR EXISTS (
       SELECT 1 FROM pg_tables t WHERE t.schemaname = 'public' AND t.tablename = 'Cohort' AND t.tableowner = r.rolname
     )) AS ok
     FROM pg_roles r WHERE r.rolname = current_user`
  )
  if (!row?.ok) {
    throw new Error(
      'This script must connect as the database owner (or a superuser). The connected role is subject to row-level security, so it would see too few rows.'
    )
  }
}
