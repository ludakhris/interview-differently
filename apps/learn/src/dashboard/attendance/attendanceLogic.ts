import type { AttendanceSheetRow, AttendanceStatus, CohortSessionDto, MarkInput } from '@id/types'

export const STATUS_ORDER: AttendanceStatus[] = ['present', 'absent', 'late', 'excused']
export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
}
export const STATUS_LETTER: Record<AttendanceStatus, string> = {
  present: 'P',
  absent: 'A',
  late: 'L',
  excused: 'E',
}
/** Keyboard shortcut -> status (on a focused learner row). */
export const KEY_STATUS: Record<string, AttendanceStatus> = {
  p: 'present',
  a: 'absent',
  l: 'late',
  e: 'excused',
}

export interface Draft {
  status: AttendanceStatus | null
  note: string
}
export type Drafts = Record<string, Draft>

export function draftsFrom(rows: AttendanceSheetRow[]): Drafts {
  return Object.fromEntries(rows.map((r) => [r.userId, { status: r.status, note: r.note ?? '' }]))
}

/** Everyone not yet marked becomes present; anyone already marked (or flipped) keeps their status. */
export function markEveryonePresent(drafts: Drafts, onlyUnmarked = true): Drafts {
  const out: Drafts = {}
  for (const [id, d] of Object.entries(drafts)) {
    out[id] = onlyUnmarked && d.status ? d : { ...d, status: 'present' }
  }
  return out
}

/** Rows whose draft differs from what is saved, as the save payload. A cleared status cannot be saved. */
export function changedMarks(rows: AttendanceSheetRow[], drafts: Drafts): MarkInput['marks'] {
  const out: MarkInput['marks'] = []
  for (const r of rows) {
    const d = drafts[r.userId]
    if (!d || !d.status) continue
    const note = d.note.trim()
    if (d.status !== r.status || note !== (r.note ?? '')) {
      out.push({ userId: r.userId, status: d.status, note: note === '' ? null : note })
    }
  }
  return out
}

export const isDirty = (rows: AttendanceSheetRow[], drafts: Drafts): boolean =>
  changedMarks(rows, drafts).length > 0

export function tally(drafts: Drafts): Record<AttendanceStatus | 'unmarked', number> {
  const t = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 }
  for (const d of Object.values(drafts)) t[d.status ?? 'unmarked']++
  return t
}

/** The default title for a new session: "Session N". */
export function defaultSessionTitle(sessions: Pick<CohortSessionDto, 'title'>[]): string {
  return `Session ${sessions.length + 1}`
}

/** The session to open first: the latest one that has started, else the earliest upcoming one. */
export function pickInitialSession(
  sessions: Pick<CohortSessionDto, 'id' | 'startsAt'>[],
  now: number
): string | null {
  if (sessions.length === 0) return null
  const started = sessions.filter((s) => new Date(s.startsAt).getTime() <= now)
  return (started.length ? started[started.length - 1] : sessions[0]).id
}

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO -> the value a datetime-local input wants (local time). */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(v: string): string | null {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export const rateLabel = (pct: number | null): string => (pct === null ? '—' : `${pct}%`)

/** "Attendance: 8 of 10 sessions (80%)", or null when there is nothing held yet. */
export function learnerAttendanceLine(a: {
  counts: { present: number; late: number; excused: number; absent: number; unmarked: number }
  ratePct: number | null
}): string | null {
  const held =
    a.counts.present + a.counts.late + a.counts.absent + a.counts.excused + a.counts.unmarked
  const counted = held - a.counts.excused
  if (held === 0 || counted === 0 || a.ratePct === null) return null
  return `Attendance: ${a.counts.present + a.counts.late} of ${counted} sessions (${a.ratePct}%)`
}
