import { describe, expect, it } from 'vitest'
import type { AttendanceSheetRow } from '@id/types'
import {
  attendanceStats,
  isTaken,
  changedMarks,
  clock,
  defaultSessionTitle,
  draftsFrom,
  fromLocalInput,
  isDirty,
  learnerAttendanceLine,
  markEveryonePresent,
  mergeAfterSave,
  pickInitialSession,
  tally,
  toLocalInput,
} from './attendanceLogic'

const row = (
  userId: string,
  status: AttendanceSheetRow['status'] = null,
  note: string | null = null
) =>
  ({
    userId,
    enrollmentId: `e-${userId}`,
    name: userId,
    email: null,
    status,
    note,
    markedAt: null,
  }) as AttendanceSheetRow

describe('attendance logic', () => {
  it('marks only the unmarked as present by default, keeping earlier marks', () => {
    const rows = [row('a'), row('b', 'late'), row('c')]
    const d = markEveryonePresent(draftsFrom(rows))
    expect(d.a.status).toBe('present')
    expect(d.b.status).toBe('late')
    expect(markEveryonePresent(draftsFrom(rows), false).b.status).toBe('present')
  })
  it('tracks dirt: clean after load, dirty after a flip, clean again when flipped back', () => {
    const rows = [row('a', 'present'), row('b')]
    const d = draftsFrom(rows)
    expect(isDirty(rows, d)).toBe(false)
    d.a = { status: 'absent', note: '' }
    expect(isDirty(rows, d)).toBe(true)
    d.a = { status: 'present', note: '' }
    expect(isDirty(rows, d)).toBe(false)
  })
  it('builds the payload from changes only, trimming notes to null', () => {
    const rows = [row('a', 'present', 'x'), row('b'), row('c')]
    const d = markEveryonePresent(draftsFrom(rows))
    d.b = { status: 'excused', note: '  doctor  ' }
    d.a = { status: 'present', note: '' }
    expect(changedMarks(rows, d)).toEqual([
      { userId: 'a', status: 'present', note: null },
      { userId: 'b', status: 'excused', note: 'doctor' },
      { userId: 'c', status: 'present', note: null },
    ])
  })
  it('tallies including unmarked', () => {
    expect(tally(draftsFrom([row('a', 'late'), row('b')]))).toMatchObject({ late: 1, unmarked: 1 })
  })
  it('names the next session and picks the latest started one', () => {
    expect(defaultSessionTitle([{ title: 'x' }, { title: 'y' }])).toBe('Session 3')
    const now = Date.parse('2026-10-07T12:00:00Z')
    const s = [
      { id: '1', startsAt: '2026-10-01T12:00:00Z' },
      { id: '2', startsAt: '2026-10-05T12:00:00Z' },
      { id: '3', startsAt: '2026-10-09T12:00:00Z' },
    ]
    expect(pickInitialSession(s, now)).toBe('2')
    expect(pickInitialSession(s.slice(2), now)).toBe('3')
    expect(pickInitialSession([], now)).toBeNull()
  })
  it('round-trips local datetime inputs and rejects garbage', () => {
    const iso = '2026-10-07T14:30:00.000Z'
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso)
    expect(fromLocalInput('')).toBeNull()
  })
  it('words the learner line, with quiet notes for sessions that do not count', () => {
    const sess = (...k: (null | 'not_taken' | 'before_join')[]) => k.map((skipped) => ({ skipped }))
    const base = { counts: { present: 7, late: 1 }, sessionsCounted: 10, ratePct: 80 }
    expect(learnerAttendanceLine({ ...base, sessions: sess(null) })).toBe(
      'Attendance: 8 of 10 sessions (80%)'
    )
    expect(
      learnerAttendanceLine({
        ...base,
        sessions: sess(null, 'not_taken', 'before_join', 'before_join'),
      })
    ).toBe('Attendance: 8 of 10 sessions (80%). Not counted: 1 not taken yet, 2 before you joined')
    const none = { counts: { present: 0, late: 0 }, sessionsCounted: 0, ratePct: null }
    expect(learnerAttendanceLine({ ...none, sessions: [] })).toBeNull()
    expect(learnerAttendanceLine({ ...none, sessions: sess('not_taken') })).toBe(
      'Attendance: no sessions counted yet (1 not taken yet)'
    )
  })
  it('after a save, keeps edits made in flight and edits to learners not in the save', () => {
    const prev = [row('a'), row('b'), row('c', 'present')]
    const sent = draftsFrom(prev)
    sent.a = { status: 'present', note: '' }
    // While the save ran: the user flipped a to late, and edited b (not in the save).
    const current = {
      ...sent,
      a: { status: 'late' as const, note: '' },
      b: { status: 'absent' as const, note: '' },
    }
    // The fresh sheet: a saved as present, c changed by someone else.
    const next = [row('a', 'present'), row('b'), row('c', 'excused')]
    const merged = mergeAfterSave(prev, sent, new Set(['a']), current, next)
    expect(merged.a.status).toBe('late') // in-flight edit survives
    expect(merged.b.status).toBe('absent') // unsaved edit survives
    expect(merged.c.status).toBe('excused') // someone else's save comes through
    // Untouched: the saved row takes the fresh value.
    const calm = mergeAfterSave(prev, sent, new Set(['a']), sent, next)
    expect(calm.a.status).toBe('present')
    expect(isDirty(next, calm)).toBe(false)
  })
  it('formats a clock time as HH:MM', () => {
    expect(clock(new Date(2026, 9, 7, 9, 5))).toBe('09:05')
  })
})

describe('attendanceStats', () => {
  const NOW = Date.parse('2026-10-07T12:00:00Z')
  const c = (present = 0, absent = 0, late = 0, excused = 0) => ({
    present,
    absent,
    late,
    excused,
    unmarked: 0,
  })
  const sess = (id: string, startsAt: string, counts = c()) =>
    ({ id, cohortId: 'c', title: id, startsAt, endsAt: null, location: null, counts }) as never
  const sessions = [
    sess('a', '2026-10-01T10:00:00Z', c(3, 1)),
    sess('b', '2026-10-05T10:00:00Z', c(2, 0, 1)),
    sess('c', '2026-10-06T10:00:00Z'),
    sess('d', '2026-10-09T10:00:00Z'),
  ]
  const r = (
    userId: string,
    present: number,
    late: number,
    counted: number,
    ratePct: number | null
  ) => ({ userId, present, late, sessions: counted, ratePct }) as never

  it('counts held and upcoming, takes the last session that was taken, and flags low rates', () => {
    const summary = {
      rows: [r('u1', 2, 0, 2, 100), r('u2', 1, 0, 2, 50), r('u3', 0, 0, 0, null)],
    } as never
    const st = attendanceStats(sessions, summary, NOW)
    expect(st.held).toBe(3)
    expect(st.upcoming).toBe(1)
    expect(st.overallPct).toBe(75)
    expect(st.last?.id).toBe('b')
    expect(st.below).toEqual(['u2'])
  })
  it('has nothing to show before any register is taken', () => {
    const st = attendanceStats([sess('x', '2026-10-06T10:00:00Z')], null, NOW)
    expect(st).toMatchObject({ held: 1, overallPct: null, last: null, below: [] })
    expect(isTaken(sess('y', '2026-10-06T10:00:00Z', c(0, 0, 0, 1)))).toBe(true)
  })
})
