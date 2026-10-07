import { describe, expect, it } from 'vitest'
import type { AttendanceSheetRow } from '@id/types'
import {
  changedMarks,
  defaultSessionTitle,
  draftsFrom,
  fromLocalInput,
  isDirty,
  learnerAttendanceLine,
  markEveryonePresent,
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
  it('words the learner line, hiding it with nothing held', () => {
    const c = (p: number, l: number, a: number, e: number, u: number) => ({
      present: p,
      late: l,
      absent: a,
      excused: e,
      unmarked: u,
    })
    expect(learnerAttendanceLine({ counts: c(7, 1, 2, 0, 0), ratePct: 80 })).toBe(
      'Attendance: 8 of 10 sessions (80%)'
    )
    expect(learnerAttendanceLine({ counts: c(0, 0, 0, 0, 0), ratePct: null })).toBeNull()
    expect(learnerAttendanceLine({ counts: c(0, 0, 0, 2, 0), ratePct: null })).toBeNull()
  })
})
