import type { AttendanceCounts, AttendanceStatus, SessionSkip } from '../attendance-types'

export const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused']

export function isStatus(v: unknown): v is AttendanceStatus {
  return typeof v === 'string' && (STATUSES as string[]).includes(v)
}

/**
 * Rate rule: (present + late) / (counted sessions - excused). A session counts for a learner only
 * if it has started, at least one mark exists for it (the register was taken) and the learner
 * enrolled before it started. Within a counted session an unmarked learner is absent.
 */
export function attendanceRate(present: number, late: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round(((present + late) / denominator) * 100)
}

export interface Standing {
  present: number
  absent: number
  late: number
  excused: number
  /** Counted sessions, excused ones left out. */
  counted: number
  /** Started sessions, counted or not. */
  held: number
  ratePct: number | null
  /** Status per counted session (absent when unmarked). */
  statuses: Record<string, AttendanceStatus>
  skipped: Record<string, SessionSkip>
}

/** One learner's standing over a cohort's sessions. `taken` is the set of sessions with at least one mark. */
export function standing(
  sessions: { id: string; startsAt: Date }[],
  taken: Set<string>,
  enrolledAt: Date,
  marks: Map<string, AttendanceStatus>,
  now: number
): Standing {
  const out: Standing = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    counted: 0,
    held: 0,
    ratePct: null,
    statuses: {},
    skipped: {},
  }
  for (const s of sessions) {
    if (s.startsAt.getTime() > now) continue
    out.held++
    if (!taken.has(s.id)) {
      out.skipped[s.id] = 'not_taken'
      continue
    }
    if (enrolledAt.getTime() >= s.startsAt.getTime()) {
      out.skipped[s.id] = 'before_join'
      continue
    }
    const st = marks.get(s.id) ?? 'absent'
    out.statuses[s.id] = st
    out[st]++
    if (st !== 'excused') out.counted++
  }
  out.ratePct = attendanceRate(out.present, out.late, out.counted)
  return out
}

export function emptyCounts(): AttendanceCounts {
  return { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 }
}

const FORMULA = /^[=+\-@\t\r]/

/** A CSV opens in Excel as UTF-8 only with this byte order mark (names with accents). */
export const CSV_BOM = '\uFEFF'

/**
 * One CSV cell: quoted when needed, and a leading = + - @ (or tab/CR) is defused so a spreadsheet
 * never runs it. Emails use the same rule (a real address does not start with + or -).
 */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (typeof v === 'string' && FORMULA.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvLine(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',')
}
