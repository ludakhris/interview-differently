import type { QueryResult } from '../sql-runner/sql-runner.service'

/**
 * Result-set comparison for hands-on SQL questions (#25).
 *
 * The student's result must contain the same rows as the reference query's.
 * Column *names* are ignored unless the question is flagged `strictColumns`
 * (a correct query that aliases differently shouldn't fail); column *count*
 * always matters. Row order is ignored unless flagged `ordered`.
 *
 * Cells compare as text, except numbers: '5985.00' and '5985' are the same
 * value, so anything numeric-looking is compared to 6 decimal places.
 */

export interface CompareOptions {
  ordered: boolean
  strictColumns: boolean
}

export interface CompareOutcome {
  match: boolean
  reason?: string
}

const NUMERIC_RE = /^-?\d+(\.\d+)?$/
// Tokens that can't appear in cell text, so joined rows compare safely.
const NULL_TOKEN = '\u0000NULL'
const CELL_SEP = '\u0001'

function normalizeCell(v: unknown): string {
  if (v === null || v === undefined) return NULL_TOKEN
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return v.toFixed(6)
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return NUMERIC_RE.test(s) ? Number(s).toFixed(6) : s
}

function normalizeRows(r: QueryResult, ordered: boolean): string[] {
  const rows = r.rows.map((row) => row.map(normalizeCell).join(CELL_SEP))
  return ordered ? rows : rows.sort()
}

export function compareResults(student: QueryResult, reference: QueryResult, opts: CompareOptions): CompareOutcome {
  if (student.columns.length !== reference.columns.length) {
    return { match: false, reason: `expected ${reference.columns.length} column(s), got ${student.columns.length}` }
  }
  if (opts.strictColumns) {
    const a = student.columns.map((c) => c.toLowerCase())
    const b = reference.columns.map((c) => c.toLowerCase())
    if (a.join(',') !== b.join(',')) return { match: false, reason: `expected columns ${b.join(', ')}` }
  }
  if (student.rowCount !== reference.rowCount) {
    return { match: false, reason: `expected ${reference.rowCount} row(s), got ${student.rowCount}` }
  }
  if (student.truncated || reference.truncated) return { match: false, reason: 'result too large to grade' }
  const a = normalizeRows(student, opts.ordered)
  const b = normalizeRows(reference, opts.ordered)
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return { match: false, reason: opts.ordered ? `row ${i + 1} differs` : 'rows differ' }
  }
  return { match: true }
}
