import type {
  AttendanceSheetRow,
  AttendanceStatus,
  CohortSessionDto,
  MarkInput,
  SessionSkip,
} from '@id/types'

const pad = (n: number) => String(n).padStart(2, '0')

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
/** Keyboard shortcut that opens and focuses the note of the focused learner row. */
export const NOTE_KEY = 'n'

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

const same = (a: Draft | undefined, b: Draft | undefined) =>
  !!a && !!b && a.status === b.status && a.note.trim() === b.note.trim()

/**
 * The drafts after a save returned the fresh sheet. A learner's draft is replaced by the fresh row
 * unless the user changed it since the baseline: for a learner in the save the baseline is what was
 * sent, for any other the previous sheet row. So an edit made while the save was in flight, or an
 * unsaved edit to a learner who was not in the save, is never overwritten, while marks other staff
 * saved in the meantime come through.
 */
export function mergeAfterSave(
  prevRows: AttendanceSheetRow[],
  sent: Drafts,
  savedIds: Set<string>,
  current: Drafts,
  nextRows: AttendanceSheetRow[]
): Drafts {
  const prev = draftsFrom(prevRows)
  const fresh = draftsFrom(nextRows)
  const out: Drafts = {}
  for (const [id, f] of Object.entries(fresh)) {
    const baseline = savedIds.has(id) ? sent[id] : prev[id]
    const cur = current[id]
    out[id] = cur && baseline && !same(cur, baseline) ? cur : f
  }
  return out
}

/** HH:MM in local time. */
export const clock = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`

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

/**
 * "Attendance: 8 of 10 sessions (80%)", with a quiet note for sessions that do not count yet (the
 * register was not taken, or they were before the learner joined). Null when there is nothing to say.
 */
export function learnerAttendanceLine(a: {
  counts: { present: number; late: number }
  sessionsCounted: number
  ratePct: number | null
  sessions: { skipped: SessionSkip | null }[]
}): string | null {
  const notTaken = a.sessions.filter((s) => s.skipped === 'not_taken').length
  const before = a.sessions.filter((s) => s.skipped === 'before_join').length
  const notes = [
    notTaken > 0 ? `${notTaken} not taken yet` : null,
    before > 0 ? `${before} before you joined` : null,
  ].filter(Boolean)
  const quiet = notes.join(', ')
  if (a.sessionsCounted > 0 && a.ratePct !== null) {
    const line = `Attendance: ${a.counts.present + a.counts.late} of ${a.sessionsCounted} sessions (${a.ratePct}%)`
    return quiet ? `${line}. Not counted: ${quiet}` : line
  }
  return quiet ? `Attendance: no sessions counted yet (${quiet})` : null
}
