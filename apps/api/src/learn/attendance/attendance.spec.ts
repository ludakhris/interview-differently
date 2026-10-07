/* eslint-disable @typescript-eslint/no-explicit-any -- a loose in-memory fake of Prisma */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import type { PrismaService } from '../../prisma/prisma.service'
import { LearnService, LEARN_ROLES } from '../learn.service'
import { ProviderAccessService } from '../provider-access.service'
import type { DataAccessLogService } from '../data-access-log.service'
import { AttendanceService } from './attendance.service'
import { attendanceRate, csvCell, standing } from './attendance-rules'

const HOUR = 3600_000
const past = (h: number) => new Date(Date.now() - h * HOUR)
const future = (h: number) => new Date(Date.now() + h * HOUR)

interface Sess {
  id: string
  cohortId: string
  title: string
  startsAt: Date
  endsAt: Date | null
  location: string | null
  createdBy: string
}
interface Mark {
  sessionId: string
  userId: string
  status: string
  note: string | null
  markedBy: string
  markedAt: Date
}

/** A small stateful fake of the tables attendance touches. */
function build(delivery: 'online' | 'live' | 'hybrid' = 'live') {
  const db = {
    sessions: [] as Sess[],
    marks: [] as Mark[],
    failUpsertFor: null as string | null,
  }
  const users: Record<string, { displayName: string | null; email: string | null }> = {
    u1: { displayName: 'Ann Able', email: 'ann@x.org' },
    u2: { displayName: 'Bo Baker', email: 'bo@x.org' },
    u3: { displayName: '=cmd|calc', email: '+evil@x.org' },
    u4: { displayName: 'Wendy Withdrawn', email: 'w@x.org' },
    outsider: { displayName: 'Out Sider', email: 'o@x.org' },
  }
  const enrollments = [
    { id: 'e1', cohortId: 'c1', userId: 'u1', status: 'enrolled' },
    { id: 'e2', cohortId: 'c1', userId: 'u2', status: 'enrolled' },
    { id: 'e3', cohortId: 'c1', userId: 'u3', status: 'completed' },
    { id: 'e4', cohortId: 'c1', userId: 'u4', status: 'withdrawn' },
    { id: 'e9', cohortId: 'c2', userId: 'outsider', status: 'enrolled' },
  ].map((e) => ({ ...e, enrolledAt: past(1000), user: users[e.userId] }))
  let seq = 0
  const workspaces: Record<string, string[]> = {
    'prov-staff': ['host'],
    'org-staff': ['host'],
    'other-org': ['elsewhere'],
    'agency-in': ['host'],
    'agency-out': ['elsewhere'],
    sys: ['host', 'elsewhere'],
  }
  const prisma = {
    institution: {
      findMany: jest.fn(async ({ where }: { where: unknown }) => {
        void where
        return []
      }),
    },
    cohort: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'c1'
          ? {
              id: 'c1',
              delivery,
              courseId: 'course',
              institution: { id: 'hostId', subdomain: 'host' },
              course: { id: 'course', providerId: 'P1' },
            }
          : null
      ),
    },
    enrollment: {
      findMany: jest.fn(async ({ where }: { where: any }) =>
        enrollments.filter(
          (e) =>
            e.cohortId === where.cohortId &&
            (!where.userId?.in || where.userId.in.includes(e.userId)) &&
            (!where.status?.not || e.status !== where.status.not)
        )
      ),
      findUnique: jest.fn(async ({ where }: { where: any }) => {
        const k = where.cohortId_userId
        return enrollments.find((e) => e.cohortId === k.cohortId && e.userId === k.userId) ?? null
      }),
    },
    user: {
      findMany: jest.fn(async ({ where }: { where: any }) =>
        where.id.in.map((id: string) => ({ id, email: users[id]?.email ?? null }))
      ),
    },
    cohortSession: {
      create: jest.fn(async ({ data }: { data: any }) => {
        const s = { id: `s${++seq}`, ...data }
        db.sessions.push(s)
        return s
      }),
      findMany: jest.fn(async ({ where }: { where: any }) =>
        db.sessions
          .filter((s) => s.cohortId === where.cohortId)
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      ),
      findFirst: jest.fn(
        async ({ where }: { where: any }) =>
          db.sessions.find((s) => s.id === where.id && s.cohortId === where.cohortId) ?? null
      ),
      update: jest.fn(async ({ where, data }: { where: any; data: any }) => {
        const s = db.sessions.find((x) => x.id === where.id)!
        Object.assign(s, data)
        return s
      }),
      delete: jest.fn(async ({ where }: { where: any }) => {
        db.sessions = db.sessions.filter((s) => s.id !== where.id)
        db.marks = db.marks.filter((m) => m.sessionId !== where.id)
      }),
    },
    attendanceMark: {
      findMany: jest.fn(async ({ where }: { where: any }) =>
        db.marks.filter((m) => {
          if (where.sessionId?.in) return where.sessionId.in.includes(m.sessionId)
          if (where.sessionId) return m.sessionId === where.sessionId
          if (where.userId)
            return (
              m.userId === where.userId &&
              db.sessions.find((s) => s.id === m.sessionId)?.cohortId === where.session.cohortId
            )
          return true
        })
      ),
      // Lazy, like a Prisma promise: nothing happens until $transaction runs it.
      upsert: jest.fn(
        ({ where, create, update }: { where: any; create: any; update: any }) =>
          () => {
            const k = where.sessionId_userId
            if (db.failUpsertFor === k.userId) throw new Error('boom')
            const m = db.marks.find((x) => x.sessionId === k.sessionId && x.userId === k.userId)
            if (m) Object.assign(m, update)
            else db.marks.push({ ...create })
          }
      ),
    },
    $transaction: jest.fn(async (ops: (() => void)[]) => {
      const snap = db.marks.map((m) => ({ ...m }))
      try {
        ops.forEach((op) => op())
      } catch (e) {
        db.marks = snap
        throw e
      }
    }),
  }
  const learn = new LearnService(prisma as unknown as PrismaService)
  jest
    .spyOn(learn, 'workspaces')
    .mockImplementation(
      async (userId: string) =>
        (workspaces[userId] ?? []).map((sub) => ({ subdomain: sub })) as never
    )
  const access = new ProviderAccessService(prisma as unknown as PrismaService, learn)
  const svc = new AttendanceService(prisma as unknown as PrismaService, access, {
    record: jest.fn(),
  } as unknown as DataAccessLogService)
  const addSession = (over: Partial<Sess> = {}) => {
    const s: Sess = {
      id: `s${++seq}`,
      cohortId: 'c1',
      title: 'Session',
      startsAt: past(24),
      endsAt: null,
      location: null,
      createdBy: 'x',
      ...over,
    }
    db.sessions.push(s)
    return s
  }
  return { svc, db, addSession, prisma, enrollments }
}

const A = LEARN_ROLES.agencyAdmin
const P = LEARN_ROLES.providerAdmin

describe('staff access matrix (same rule as the roster)', () => {
  const allowed: [string, string][] = [
    ['prov-staff', P],
    ['agency-in', A],
    ['sys', LEARN_ROLES.systemAdmin],
  ]
  it.each(allowed)('%s as %s can read the sessions', async (user, role) => {
    const { svc } = build()
    await expect(svc.listSessions(user, role, 'c1')).resolves.toEqual([])
  })
  const refused: [string, string | undefined][] = [
    ['other-org', P],
    ['agency-out', A],
    ['org-staff', undefined],
    ['learner-1', undefined],
    ['prov-staff', 'case-manager'],
    ['prov-staff', 'learner'],
  ]
  it.each(refused)('%s as %s is refused on every staff endpoint', async (user, role) => {
    const { svc, addSession } = build()
    const s = addSession()
    const calls = [
      () => svc.listSessions(user, role, 'c1'),
      () => svc.createSession(user, role, 'c1', { title: 'x', startsAt: past(1).toISOString() }),
      () => svc.updateSession(user, role, 'c1', s.id, { title: 'y' }),
      () => svc.deleteSession(user, role, 'c1', s.id),
      () => svc.sheet(user, role, 'c1', s.id),
      () => svc.saveMarks(user, role, 'c1', s.id, { marks: [{ userId: 'u1', status: 'present' }] }),
      () => svc.summary(user, role, 'c1'),
      () => svc.csv(user, role, 'c1'),
    ]
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(ForbiddenException)
  })
  it('an unknown cohort is 404', async () => {
    const { svc } = build()
    await expect(svc.listSessions('sys', LEARN_ROLES.systemAdmin, 'nope')).rejects.toBeInstanceOf(
      NotFoundException
    )
  })
})

describe('sessions', () => {
  it('creates, validates, lists with counts, updates and deletes (marks go too)', async () => {
    const { svc, db } = build()
    const made = await svc.createSession('prov-staff', P, 'c1', {
      title: ' Session 1 ',
      startsAt: past(2).toISOString(),
    })
    expect(made.title).toBe('Session 1')
    expect(made.counts).toEqual({ present: 0, absent: 0, late: 0, excused: 0, unmarked: 3 })
    const bad = [
      { title: '', startsAt: past(1).toISOString() },
      { title: 'x'.repeat(121), startsAt: past(1).toISOString() },
      { title: 'ok', startsAt: 'not a date' },
      { title: 'ok' },
      { title: 'ok', startsAt: past(1).toISOString(), endsAt: past(2).toISOString() },
      { title: 'ok', startsAt: past(1).toISOString(), location: 'x'.repeat(201) },
    ]
    for (const b of bad)
      await expect(svc.createSession('prov-staff', P, 'c1', b)).rejects.toBeInstanceOf(
        BadRequestException
      )
    await expect(
      svc.updateSession('prov-staff', P, 'c1', made.id, { endsAt: past(5).toISOString() })
    ).rejects.toBeInstanceOf(BadRequestException)
    const upd = await svc.updateSession('prov-staff', P, 'c1', made.id, { location: 'Room 4' })
    expect(upd.location).toBe('Room 4')
    await svc.saveMarks('prov-staff', P, 'c1', made.id, {
      marks: [{ userId: 'u1', status: 'present' }],
    })
    expect((await svc.listSessions('prov-staff', P, 'c1'))[0].counts.present).toBe(1)
    await expect(svc.deleteSession('prov-staff', P, 'c1', made.id)).resolves.toEqual({
      deleted: true,
    })
    expect(db.marks).toHaveLength(0)
    await expect(svc.deleteSession('prov-staff', P, 'c1', made.id)).rejects.toBeInstanceOf(
      NotFoundException
    )
  })
  it('a session of another cohort is not reachable through this cohort', async () => {
    const { svc, addSession } = build()
    const s = addSession({ cohortId: 'c2' })
    await expect(svc.sheet('sys', LEARN_ROLES.systemAdmin, 'c1', s.id)).rejects.toBeInstanceOf(
      NotFoundException
    )
  })
  it('writes are 409 on an online cohort, reads still work', async () => {
    const { svc, addSession } = build('online')
    const s = addSession()
    await expect(
      svc.createSession('prov-staff', P, 'c1', { title: 'x', startsAt: past(1).toISOString() })
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(
      svc.updateSession('prov-staff', P, 'c1', s.id, { title: 'y' })
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(svc.deleteSession('prov-staff', P, 'c1', s.id)).rejects.toBeInstanceOf(
      ConflictException
    )
    await expect(
      svc.saveMarks('prov-staff', P, 'c1', s.id, { marks: [{ userId: 'u1', status: 'present' }] })
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(svc.sheet('prov-staff', P, 'c1', s.id)).resolves.toBeDefined()
    await expect(svc.summary('prov-staff', P, 'c1')).resolves.toBeDefined()
  })
  it('hybrid is allowed', async () => {
    const { svc } = build('hybrid')
    await expect(
      svc.createSession('prov-staff', P, 'c1', { title: 'x', startsAt: past(1).toISOString() })
    ).resolves.toBeDefined()
  })
})

describe('the sheet and saving marks', () => {
  it('excludes withdrawn learners unless already marked', async () => {
    const { svc, addSession, db } = build()
    const s = addSession()
    let sheet = await svc.sheet('prov-staff', P, 'c1', s.id)
    expect(sheet.rows.map((r) => r.userId).sort()).toEqual(['u1', 'u2', 'u3'])
    expect(sheet.rows.every((r) => r.status === null)).toBe(true)
    db.marks.push({
      sessionId: s.id,
      userId: 'u4',
      status: 'absent',
      note: null,
      markedBy: 'x',
      markedAt: new Date(),
    })
    sheet = await svc.sheet('prov-staff', P, 'c1', s.id)
    expect(sheet.rows.map((r) => r.userId)).toContain('u4')
    // Counts: the withdrawn learner is not "unmarked", the three active ones are.
    expect(sheet.session.counts).toEqual({
      present: 0,
      absent: 1,
      late: 0,
      excused: 0,
      unmarked: 3,
    })
  })
  it('upserts in one call, sets markedBy, and is repeatable', async () => {
    const { svc, addSession, db, prisma } = build()
    const s = addSession()
    const sheet = await svc.saveMarks('prov-staff', P, 'c1', s.id, {
      marks: [
        { userId: 'u1', status: 'present' },
        { userId: 'u2', status: 'late', note: 'bus' },
      ],
    })
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(db.marks.every((m) => m.markedBy === 'prov-staff')).toBe(true)
    expect(sheet.rows.find((r) => r.userId === 'u2')).toMatchObject({ status: 'late', note: 'bus' })
    const again = await svc.saveMarks('prov-staff', P, 'c1', s.id, {
      marks: [{ userId: 'u2', status: 'absent', note: null }],
    })
    expect(db.marks).toHaveLength(2)
    expect(again.rows.find((r) => r.userId === 'u2')).toMatchObject({
      status: 'absent',
      note: null,
    })
    expect(again.rows.find((r) => r.userId === 'u1')?.status).toBe('present')
  })
  it('a user not in this cohort is 400 and nothing is written', async () => {
    const { svc, addSession, db } = build()
    const s = addSession()
    await expect(
      svc.saveMarks('prov-staff', P, 'c1', s.id, {
        marks: [
          { userId: 'u1', status: 'present' },
          { userId: 'outsider', status: 'present' },
        ],
      })
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(db.marks).toHaveLength(0)
  })
  it('rejects malformed bodies', async () => {
    const { svc, addSession, db } = build()
    const s = addSession()
    const bodies: unknown[] = [
      null,
      {},
      { marks: [] },
      { marks: 'x' },
      { marks: [{ userId: 'u1', status: 'sleeping' }] },
      { marks: [{ status: 'present' }] },
      { marks: [{ userId: 'u1', status: 'present', note: 'x'.repeat(501) }] },
      {
        marks: [
          { userId: 'u1', status: 'present' },
          { userId: 'u1', status: 'absent' },
        ],
      },
    ]
    for (const b of bodies)
      await expect(svc.saveMarks('prov-staff', P, 'c1', s.id, b)).rejects.toBeInstanceOf(
        BadRequestException
      )
    expect(db.marks).toHaveLength(0)
  })
  it('is atomic: a failure on the last learner leaves nothing, not even the earlier marks', async () => {
    const { svc, addSession, db } = build()
    const s = addSession()
    db.failUpsertFor = 'u3'
    await expect(
      svc.saveMarks('prov-staff', P, 'c1', s.id, {
        marks: [
          { userId: 'u1', status: 'present' },
          { userId: 'u2', status: 'present' },
          { userId: 'u3', status: 'present' },
        ],
      })
    ).rejects.toThrow('boom')
    expect(db.marks).toHaveLength(0)
  })
})

describe('summary, rate and csv', () => {
  const markIn = (db: { marks: Mark[] }) => (sessionId: string, userId: string, status: string) =>
    db.marks.push({ sessionId, userId, status, note: null, markedBy: 'x', markedAt: new Date() })

  it('rate: excused leaves the denominator, future sessions and untaken sessions do not count, unmarked in a taken session is absent', async () => {
    const { svc, addSession, db } = build()
    const s1 = addSession({ startsAt: past(72) })
    const s2 = addSession({ startsAt: past(48) })
    const s3 = addSession({ startsAt: past(24) })
    const s4 = addSession({ startsAt: past(1) })
    const sf = addSession({ startsAt: future(24) })
    addSession({ startsAt: past(2) }) // started, nobody marked: not taken yet
    const mark = markIn(db)
    mark(s1.id, 'u1', 'present')
    mark(s2.id, 'u1', 'late')
    mark(s3.id, 'u1', 'excused')
    mark(s4.id, 'u1', 'absent')
    mark(sf.id, 'u1', 'present') // a mark on a future session must not count
    const sum = await svc.summary('prov-staff', P, 'c1')
    expect(sum.sessions).toBe(5)
    expect(sum.sessionList.filter((s) => s.taken)).toHaveLength(4)
    const u1 = sum.rows.find((r) => r.userId === 'u1')!
    expect(u1).toMatchObject({
      present: 1,
      late: 1,
      excused: 1,
      absent: 1,
      sessions: 3,
      sessionsHeld: 5,
      ratePct: 67,
    })
    expect(Object.keys(u1.marks)).not.toContain(sf.id)
    expect(Object.values(u1.skipped)).toEqual(['not_taken'])
    // u2 has no marks in 4 taken sessions: absent in each.
    const u2 = sum.rows.find((r) => r.userId === 'u2')!
    expect(u2).toMatchObject({ absent: 4, sessions: 4, ratePct: 0 })
    expect(Object.values(u2.marks)).toEqual(['absent', 'absent', 'absent', 'absent'])
    expect(sum.rows.map((r) => r.userId)).not.toContain('u4')
  })

  it('a session before the learner enrolled does not count for them', async () => {
    const { svc, addSession, db, enrollments } = build()
    const s1 = addSession({ startsAt: past(72) })
    const s2 = addSession({ startsAt: past(24) })
    enrollments.find((e) => e.userId === 'u2')!.enrolledAt = past(48)
    const mark = markIn(db)
    mark(s1.id, 'u1', 'present')
    mark(s2.id, 'u1', 'present')
    mark(s2.id, 'u2', 'present')
    const sum = await svc.summary('prov-staff', P, 'c1')
    const u2 = sum.rows.find((r) => r.userId === 'u2')!
    expect(u2).toMatchObject({ sessions: 1, sessionsHeld: 2, ratePct: 100 })
    expect(u2.skipped).toEqual({ [s1.id]: 'before_join' })
    const mine = await svc.mine('u2', 'c1')
    expect(mine.sessions.map((s) => s.skipped)).toEqual(['before_join', null])
    expect(mine.sessionsCounted).toBe(1)
    expect(mine.ratePct).toBe(100)
  })

  it('standing: nothing counts before the register is taken', () => {
    const s = [{ id: 'a', startsAt: past(5) }]
    const none = standing(s, new Set(), past(100), new Map(), Date.now())
    expect(none).toMatchObject({ counted: 0, held: 1, ratePct: null })
    expect(none.skipped).toEqual({ a: 'not_taken' })
    // Enrolled exactly at the start is not "before": the session does not count.
    const at = standing(s, new Set(['a']), s[0].startsAt, new Map(), Date.now())
    expect(at.skipped).toEqual({ a: 'before_join' })
  })
  it('rate is null with no counted session', () => {
    expect(attendanceRate(0, 0, 0)).toBeNull()
    expect(attendanceRate(3, 1, 5)).toBe(80)
  })
  it('csv has a BOM, numeric rate_percent, sessions_counted and sessions_held, and neutralizes formulas', async () => {
    const { svc, addSession, db } = build()
    const s1 = addSession()
    markIn(db)(s1.id, 'u1', 'present')
    const csv = await svc.csv('prov-staff', P, 'c1')
    expect(csv.startsWith('\uFEFF')).toBe(true)
    const lines = csv.slice(1).trimEnd().split('\r\n')
    expect(lines[0]).toBe(
      'name,email,present,absent,late,excused,sessions_counted,sessions_held,rate_percent'
    )
    expect(lines).toContain('Ann Able,ann@x.org,1,0,0,0,1,1,100')
    expect(lines).toContain('Bo Baker,bo@x.org,0,1,0,0,1,1,0')
    expect(lines.some((l) => l.startsWith("'=cmd|calc,'+evil@x.org,"))).toBe(true)
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"')
    for (const c of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])
      expect(csvCell(c).replace(/^"/, '')).toMatch(/^'/)
    expect(csvCell(-5)).toBe('-5')
    expect(csvCell(null)).toBe('')
  })
  it('csv rate_percent is empty when nothing counts', async () => {
    const { svc, addSession } = build()
    addSession() // held, not taken
    const lines = (await svc.csv('prov-staff', P, 'c1')).slice(1).trimEnd().split('\r\n')
    expect(lines).toContain('Ann Able,ann@x.org,0,0,0,0,0,1,')
  })
})

describe('the learner view', () => {
  it('shows only their own marks, never the note, and 404 for a non-member', async () => {
    const { svc, addSession, db } = build()
    const s1 = addSession({ startsAt: past(48) })
    const s2 = addSession({ startsAt: past(24) })
    addSession({ startsAt: future(24), title: 'Next' })
    db.marks.push(
      {
        sessionId: s1.id,
        userId: 'u1',
        status: 'present',
        note: 'SECRET staff note',
        markedBy: 'x',
        markedAt: new Date(),
      },
      {
        sessionId: s1.id,
        userId: 'u2',
        status: 'absent',
        note: 'other learner',
        markedBy: 'x',
        markedAt: new Date(),
      }
    )
    const mine = await svc.mine('u1', 'c1')
    expect(JSON.stringify(mine)).not.toMatch(/SECRET|other learner|note/)
    // s1 was taken (u2 has a mark): u1 present. s2 has no marks at all: not taken yet.
    expect(mine.sessions.map((s) => s.status)).toEqual(['present', null, null])
    expect(mine.sessions.map((s) => s.skipped)).toEqual([null, 'not_taken', null])
    expect(mine.counts).toEqual({ present: 1, absent: 0, late: 0, excused: 0, unmarked: 0 })
    expect(mine.sessionsCounted).toBe(1)
    expect(mine.ratePct).toBe(100)
    expect(s2.id).toBeDefined()
    await expect(svc.mine('outsider', 'c1')).rejects.toBeInstanceOf(NotFoundException)
  })
})
