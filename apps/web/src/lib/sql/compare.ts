import type { SandboxResult } from './sandboxDb'

/**
 * Result-set comparison for SQL questions — the browser-side twin of
 * apps/api/src/assessments/grade.ts (keep the rules in sync).
 *
 * Column names are ignored unless `strictColumns`; column count always
 * matters. Row order is ignored unless `ordered`. Numeric-looking cells
 * compare to 6 decimal places so '5985.00' equals '5985'.
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

function normalizeRows(r: SandboxResult, ordered: boolean): string[] {
  const rows = r.rows.map((row) => row.map(normalizeCell).join(CELL_SEP))
  return ordered ? rows : rows.sort()
}

export function compareResults(student: SandboxResult, reference: SandboxResult, opts: CompareOptions): CompareOutcome {
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
  // SandboxResult caps rows at ROW_CAP; anything bigger can't be graded client-side.
  if (student.rows.length < student.rowCount || reference.rows.length < reference.rowCount) {
    return { match: false, reason: 'result too large to grade' }
  }
  const a = normalizeRows(student, opts.ordered)
  const b = normalizeRows(reference, opts.ordered)
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return { match: false, reason: opts.ordered ? `row ${i + 1} differs` : 'rows differ' }
  }
  return { match: true }
}
