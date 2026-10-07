import type { AttendanceCounts, AttendanceStatus } from '../attendance-types'

export const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused']

export function isStatus(v: unknown): v is AttendanceStatus {
  return typeof v === 'string' && (STATUSES as string[]).includes(v)
}

/**
 * Rate rule: (present + late) / (held sessions - excused). Sessions that have not started do not
 * count, a held session with no mark counts against the learner, excused sessions drop out.
 * `heldSessions` is the number of sessions whose start has passed.
 */
export function attendanceRate(
  present: number,
  late: number,
  excused: number,
  heldSessions: number
): { counted: number; ratePct: number | null } {
  const counted = Math.max(0, heldSessions - excused)
  if (counted === 0) return { counted, ratePct: null }
  return { counted, ratePct: Math.round(((present + late) / counted) * 100) }
}

export function emptyCounts(): AttendanceCounts {
  return { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 }
}

const FORMULA = /^[=+\-@\t\r]/

/** One CSV cell: quoted when needed, and a leading = + - @ (or tab/CR) is defused so a spreadsheet never runs it. */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (typeof v === 'string' && FORMULA.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvLine(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',')
}
