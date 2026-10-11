import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Real Postgres (PGlite) with every migration applied, for tests of the database rules: triggers and
 * row-level security. PGlite needs Node's VM modules, so the specs that use this only run with
 *   NODE_OPTIONS=--experimental-vm-modules npx jest   (the `test` script sets it)
 */
export const dbTestsEnabled = /experimental-vm-modules/.test(process.env.NODE_OPTIONS ?? '')

// In CI a run that skipped these specs would look green with the isolation untested, so it fails instead.
if (!dbTestsEnabled && process.env.CI) {
  throw new Error(
    'The database specs need NODE_OPTIONS=--experimental-vm-modules (npm test sets it)'
  )
}

const MIGRATIONS = join(__dirname, '../../../prisma/migrations')

/** The real migrations on a fresh Postgres; `before` stops ahead of one (its directory name) to test it on its own. */
export function migrationSql(dir: string): string {
  return readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8')
}

export async function migratedDb(opts: { before?: string } = {}): Promise<PGlite> {
  const db = new PGlite()
  const dirs = readdirSync(MIGRATIONS)
    .filter((n) => statSync(join(MIGRATIONS, n)).isDirectory())
    .sort()
    .filter((n) => !opts.before || n < opts.before)
  for (const dir of dirs)
    await db.exec(readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8'))
  return db
}

type Row = Record<string, string | number | boolean | null>

/**
 * Inserts one row, filling every required column you did not give with a dummy value, so a test
 * names only what it cares about. Returns the new row.
 */
export async function insert(db: PGlite, table: string, values: Row): Promise<Row> {
  const cols = await db.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
       AND is_nullable = 'NO' AND column_default IS NULL`,
    [table]
  )
  const row: Row = { ...values }
  for (const { column_name, data_type } of cols.rows) {
    if (column_name in row) continue
    row[column_name] =
      column_name === 'id'
        ? randomUUID()
        : data_type === 'date'
          ? '2026-01-01'
          : data_type.startsWith('timestamp')
            ? new Date().toISOString()
            : data_type === 'integer' || data_type === 'double precision'
              ? 0
              : data_type === 'boolean'
                ? false
                : data_type === 'jsonb' || data_type === 'json'
                  ? '{}'
                  : data_type === 'ARRAY'
                    ? '{}'
                    : 'x'
  }
  const names = Object.keys(row)
  const res = await db.query<Row>(
    `INSERT INTO "${table}" (${names.map((n) => `"${n}"`).join(', ')})
     VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    names.map((n) => row[n])
  )
  return res.rows[0]
}
