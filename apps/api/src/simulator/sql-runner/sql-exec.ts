import { PGlite } from '@electric-sql/pglite'

/**
 * The parts of running SQL that both the API process and the grading child process need. No
 * framework imports, so the child (`sql-worker.ts`) stays small.
 */

export interface SchemaColumn {
  name: string
  type: string
}

export interface SchemaTable {
  table: string
  columns: SchemaColumn[]
  rowCount: number
}

export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  command: string
  truncated?: boolean
}

/**
 * A query that did not produce a result. `stopped`: the runner stopped it (too long, too large, or
 * its process died): the learner's own query counts against them, a reference query does not.
 * `infra`: grading itself failed (it would not start, the dataset would not load, the call ran out
 * of time): nobody's query is at fault, so the answer must not be scored.
 */
export type QueryOutcome =
  | { ok: true; result: QueryResult }
  | { ok: false; error: string; stopped?: true; infra?: true }

// Grading cap — a runaway cartesian join shouldn't take the API down.
export const GRADE_ROW_CAP = 5000

// Return dates / numerics as their Postgres text form instead of JS Date /
// number so results look like psql output and compare byte-for-byte between
// browser and server runs.
const TEXT_PARSERS: Record<number, (v: string) => string> = {
  1082: (v) => v, // date
  1114: (v) => v, // timestamp
  1184: (v) => v, // timestamptz
  1700: (v) => v, // numeric
}

export async function buildDb(setupSql: string): Promise<PGlite> {
  const db = new PGlite({ parsers: TEXT_PARSERS })
  try {
    await db.exec(setupSql)
  } catch (err) {
    await db.close()
    throw err
  }
  return db
}

/** Largest text kept from one cell, and from one result in all. Bigger results are marked truncated. */
export const MAX_CELL_CHARS = 10_000
export const MAX_RESULT_CHARS = 4_000_000

/** A value that survives JSON and the process boundary: big integers and bytes become text. */
export function toJsonSafe(v: unknown): unknown {
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'number' && !Number.isFinite(v)) return String(v)
  if (v instanceof Uint8Array) return `\\x${Buffer.from(v).toString('hex')}`
  if (v instanceof Date) return v.toISOString()
  if (Array.isArray(v)) return v.map(toJsonSafe)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJsonSafe(x)]))
  }
  return v
}

/**
 * The rows a grader compares: at most GRADE_ROW_CAP rows, values made JSON-safe, text cells cut at
 * MAX_CELL_CHARS and the whole result kept under MAX_RESULT_CHARS. `truncated` says if anything
 * was dropped, and a truncated result is never graded as a match.
 */
export function boundRows(
  all: Record<string, unknown>[],
  columns: string[]
): { rows: unknown[][]; truncated: boolean } {
  const rows: unknown[][] = []
  let chars = 0
  let truncated = all.length > GRADE_ROW_CAP
  for (const r of all.slice(0, GRADE_ROW_CAP)) {
    const row = columns.map((c) => {
      const v = toJsonSafe(r[c])
      if (typeof v === 'string' && v.length > MAX_CELL_CHARS) {
        truncated = true
        return v.slice(0, MAX_CELL_CHARS)
      }
      return v
    })
    chars += JSON.stringify(row).length
    if (chars > MAX_RESULT_CHARS) {
      truncated = true
      break
    }
    rows.push(row)
  }
  return { rows, truncated }
}

export async function runOne(db: PGlite, sql: string): Promise<QueryResult> {
  const results = await db.exec(sql)
  const last = results[results.length - 1]
  if (!last) return { columns: [], rows: [], rowCount: 0, command: '' }
  const columns = last.fields.map((f) => f.name)
  const all = last.rows as Record<string, unknown>[]
  const { rows, truncated } = boundRows(all, columns)
  return { columns, rows, rowCount: all.length, command: last.command ?? '', truncated }
}

/** One query inside a transaction that is always rolled back. Errors are returned, not thrown. */
export async function runRolledBack(db: PGlite, sql: string): Promise<QueryOutcome> {
  await db.exec('BEGIN')
  try {
    return { ok: true, result: await runOne(db, sql) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  } finally {
    await db.exec('ROLLBACK')
  }
}
