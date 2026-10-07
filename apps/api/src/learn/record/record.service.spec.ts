import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { PrismaService } from '../../prisma/prisma.service'
import type { ActivityService } from '../activity/activity.service'
import type { AttendanceService } from '../attendance/attendance.service'
import { DataAccessLogService } from '../data-access-log.service'
import { LearnService } from '../learn.service'
import { ParticipantNotesService } from '../talent/participant-notes.service'
import type { TalentService } from '../talent/talent.service'
import { ProviderAccessService } from '../provider-access.service'
import { RecordService } from './record.service'

// Cohort C1 is run by organization ORG1 for a course of provider P1. learner-1 is enrolled in it.
// staff-p1 is staff of P1 (and is also enrolled in C1, to test "not your own record").
const memberships = [
  { userId: 'staff-p1', institutionId: 'P1', kind: 'provider' },
  { userId: 'staff-p2', institutionId: 'P2', kind: 'provider' },
  { userId: 'staff-o1', institutionId: 'ORG1', kind: 'organization' },
  { userId: 'staff-p1-away', institutionId: 'P1', kind: 'provider' },
]
// Who may open the host workspace of C1 (LearnService.assertWorkspace).
const opensOrg1 = new Set(['staff-p1', 'staff-p2', 'staff-o1', 'agency-1', 'root'])

const users: Record<string, { displayName: string | null; email: string }> = {
  'learner-1': { displayName: 'Lena Learner', email: 'lena@x.org' },
  'staff-p1': { displayName: 'Dana Reyes', email: 'dana@p1.org' },
  'staff-o1': { displayName: 'Olu Org', email: 'olu@org1.org' },
}
const enrolled = new Set(['learner-1', 'staff-p1'])

interface Row {
  [k: string]: unknown
}
let audit: Row[]
const NOTE = {
  id: 'n1',
  providerId: 'P1',
  userId: 'learner-1',
  cohortId: 'C1',
  body: 'Needs a laptop',
}
const ITEM = { id: 'i1', providerId: 'P1', userId: 'learner-1', title: 'Bus pass' }

const stamp = new Date('2026-10-01T10:00:00Z')
const prisma = {
  cohort: {
    findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.filter((id) => id === 'C1').map((id) => ({ id, name: 'Fall 2026' }))
    ),
    findUnique: jest.fn(async () => ({
      id: 'C1',
      delivery: 'live',
      courseId: 'CO1',
      institution: { id: 'ORG1', subdomain: 'org1' },
      course: { id: 'CO1', providerId: 'P1' },
    })),
  },
  membership: {
    findFirst: jest.fn(async ({ where }: { where: { userId: string; institutionId: string } }) =>
      memberships.find(
        (m) =>
          m.userId === where.userId &&
          m.institutionId === where.institutionId &&
          m.kind === 'provider'
      )
        ? { id: 'm' }
        : null
    ),
  },
  enrollment: {
    findUnique: jest.fn(async ({ where }: { where: { cohortId_userId: { userId: string } } }) => {
      const userId = where.cohortId_userId.userId
      if (!enrolled.has(userId)) return null
      return {
        id: `e-${userId}`,
        status: 'enrolled',
        enrolledAt: stamp,
        user: users[userId],
        cohort: { name: 'Fall 2026', course: { title: 'Interview Ready' } },
      }
    }),
    // assertParticipantOfProvider
    findFirst: jest.fn(async ({ where }: { where: { userId: string } }) =>
      enrolled.has(where.userId) ? { id: 'e' } : null
    ),
  },
  user: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => users[where.id] ?? null),
    findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.filter((id) => users[id]).map((id) => ({ id, ...users[id] }))
    ),
  },
  attendanceMark: {
    findMany: jest.fn(async () => [
      {
        sessionId: 's1',
        note: 'Left early for work',
        markedBy: 'staff-o1',
        markedAt: new Date('2026-10-02T09:00:00Z'),
        session: { title: 'Week 1', startsAt: new Date('2026-10-01T14:00:00Z') },
      },
      {
        sessionId: 's2',
        note: '  ',
        markedBy: 'staff-o1',
        markedAt: new Date('2026-10-09T09:00:00Z'),
        session: { title: 'Week 2', startsAt: new Date('2026-10-08T14:00:00Z') },
      },
      {
        sessionId: 's3',
        note: 'Brought a guest',
        markedBy: 'gone',
        markedAt: new Date('2026-10-16T09:00:00Z'),
        session: { title: 'Week 3', startsAt: new Date('2026-10-15T14:00:00Z') },
      },
    ]),
  },
  participantNote: {
    findMany: jest.fn(async ({ where }: { where: { userId: string } }) =>
      where.userId === 'learner-1'
        ? [
            {
              ...NOTE,
              authorId: 'staff-p1',
              authorName: 'Dana Reyes',
              createdAt: stamp,
              updatedAt: stamp,
            },
          ]
        : []
    ),
  },
  supportItem: {
    findMany: jest.fn(async ({ where }: { where: { userId: string } }) =>
      where.userId === 'learner-1'
        ? [
            {
              ...ITEM,
              cohortId: null,
              category: 'transportation',
              details: null,
              status: 'open',
              dueDate: null,
              assigneeId: null,
              assigneeName: null,
              createdById: 'staff-p1',
              createdByName: 'Dana Reyes',
              resolvedAt: null,
              createdAt: stamp,
              updatedAt: stamp,
            },
          ]
        : []
    ),
  },
  dataAccessLog: {
    create: jest.fn(async ({ data }: { data: Row }) => {
      audit.push(data)
    }),
  },
} as unknown as PrismaService

const learn = new LearnService(prisma)
jest.spyOn(learn, 'assertWorkspace').mockImplementation(async (userId: string) => {
  if (!opensOrg1.has(userId)) throw new ForbiddenException('No access to this workspace')
})
jest.spyOn(learn, 'enrollmentRows').mockResolvedValue([
  {
    cohortId: 'C1',
    userId: 'learner-1',
    status: 'enrolled',
    readinessThreshold: 70,
    targetScore: 80,
    pre: null,
    post: null,
    interviewBest: 82,
    interviewAttempts: 2,
    itemsDone: 3,
    itemsTotal: 8,
  } as never,
])

const access = new ProviderAccessService(prisma, learn)
const notes = new ParticipantNotesService(prisma, access, new DataAccessLogService(prisma, access))

const attendance = {
  summary: jest.fn(async () => ({
    cohortId: 'C1',
    sessions: 3,
    sessionList: [
      { id: 's1', title: 'Week 1', startsAt: '2026-10-01T14:00:00.000Z', taken: true },
      { id: 's2', title: 'Week 2', startsAt: '2026-10-08T14:00:00.000Z', taken: true },
      { id: 's3', title: 'Week 3', startsAt: '2026-10-15T14:00:00.000Z', taken: false },
    ],
    rows: [
      {
        userId: 'learner-1',
        name: 'Lena Learner',
        present: 1,
        absent: 1,
        late: 0,
        excused: 0,
        sessions: 2,
        sessionsHeld: 3,
        ratePct: 50,
        marks: { s1: 'present', s2: 'absent' },
        skipped: { s3: 'not_taken' },
        notes: { s1: 'Left early for work' },
      },
    ],
  })),
} as unknown as AttendanceService
const activityReport = {
  cohortId: 'C1',
  userId: 'learner-1',
  name: 'Lena Learner',
  from: '2026-09-08',
  to: '2026-10-07',
  tz: 'America/New_York',
  totalSeconds: 3600,
  activeDays: 2,
  averagePerActiveDaySeconds: 1800,
  days: [],
}
const activity = {
  learnerReport: jest.fn(async () => activityReport),
} as unknown as ActivityService
const talent = {
  profileStatus: jest.fn(async () => ({ status: 'shared', complete: true, fresh: null })),
} as unknown as TalentService

const service = new RecordService(prisma, access, learn, attendance, activity, notes, talent)
const ask = (userId: string, role: string | undefined, learner = 'learner-1', tz?: string) =>
  service.record(userId, role, 'C1', learner, { tz })

beforeEach(() => {
  audit = []
  jest.clearAllMocks()
})

describe('who may open a learner record', () => {
  it('refuses a learner (no role), and reads nothing', async () => {
    await expect(ask('learner-1', undefined)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(ask('learner-1', 'learner')).rejects.toBeInstanceOf(ForbiddenException)
    expect(attendance.summary).not.toHaveBeenCalled()
    expect(audit).toHaveLength(0)
  })

  it('refuses a case manager', async () => {
    await expect(ask('staff-p1', 'case-manager')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses staff who cannot open the cohort workspace', async () => {
    await expect(ask('staff-p1-away', 'provider-admin')).rejects.toBeInstanceOf(ForbiddenException)
    expect(audit).toHaveLength(0)
  })

  it('404s for a person not enrolled in the cohort, before any audit', async () => {
    await expect(ask('staff-p1', 'provider-admin', 'someone-else')).rejects.toBeInstanceOf(
      NotFoundException
    )
    expect(audit).toHaveLength(0)
    expect(attendance.summary).not.toHaveBeenCalled()
  })

  it('400s on an unknown timezone', async () => {
    await expect(
      ask('staff-p1', 'provider-admin', 'learner-1', 'Mars/Base')
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(audit).toHaveLength(0)
  })
})

describe('restricted callers (cohort staff who are not staff of the provider)', () => {
  const restricted: [string, string, string][] = [
    ['an agency admin', 'agency-1', 'agency-admin'],
    ['staff of another provider', 'staff-p2', 'provider-admin'],
    ['organization staff', 'staff-o1', 'provider-admin'],
  ]
  for (const [who, userId, role] of restricted) {
    it(`${who}: gets attendance and activity, no participant notes, no audit rows`, async () => {
      const r = await ask(userId, role)
      expect(r.notes.restricted).toBe(true)
      expect(r.notes.participant).toBeNull()
      expect(r.notes.support).toBeNull()
      expect(r.notes.cohortNames).toEqual({})
      expect(r.header.profile).toBeNull()
      expect(r.notes.attendance.map((n) => n.sessionId)).toEqual(['s3', 's1'])
      expect(r.attendance.ratePct).toBe(50)
      expect(r.activity.totalSeconds).toBe(3600)
      expect(audit).toHaveLength(0)
      expect(talent.profileStatus).not.toHaveBeenCalled()
      expect(JSON.stringify(r)).not.toContain('Needs a laptop')
      expect(JSON.stringify(r)).not.toContain('Bus pass')
    })
  }
})

describe('staff of the provider', () => {
  it('gets notes and support items, and the audit rows for reading them', async () => {
    const r = await ask('staff-p1', 'provider-admin')
    expect(r.notes.restricted).toBe(false)
    expect(r.notes.cohortNames).toEqual({ C1: 'Fall 2026' })
    expect(r.notes.participant?.map((n) => n.body)).toEqual(['Needs a laptop'])
    expect(r.notes.support?.map((i) => i.title)).toEqual(['Bus pass'])
    expect(r.header.profile).toEqual({ status: 'shared', complete: true, fresh: null })
    expect(audit.map((a) => `${a.resource}/${a.action}`).sort()).toEqual([
      'note/list',
      'support_item/list',
    ])
    expect(audit.every((a) => a.subjectUserId === 'learner-1' && a.providerId === 'P1')).toBe(true)
  })

  it('a system admin gets them too', async () => {
    const r = await ask('root', 'system-admin')
    expect(r.notes.restricted).toBe(false)
    expect(audit).toHaveLength(2)
  })

  it('cannot read their own participant notes (restricted, no audit rows)', async () => {
    const r = await ask('staff-p1', 'provider-admin', 'staff-p1')
    expect(r.notes.restricted).toBe(true)
    expect(r.notes.participant).toBeNull()
    expect(r.notes.support).toBeNull()
    expect(audit).toHaveLength(0)
  })

  it('does not write the audit rows when the audit write fails (nothing is returned)', async () => {
    ;(prisma.dataAccessLog.create as jest.Mock).mockRejectedValueOnce(new Error('audit down'))
    await expect(ask('staff-p1', 'provider-admin')).rejects.toThrow('audit down')
  })
})

describe('what the record holds', () => {
  it('has the header, attendance newest first and attendance notes with names', async () => {
    const r = await ask('staff-p1', 'provider-admin')
    expect(r.header).toMatchObject({
      userId: 'learner-1',
      name: 'Lena Learner',
      email: 'lena@x.org',
      status: 'enrolled',
      courseTitle: 'Interview Ready',
      cohortName: 'Fall 2026',
      providerId: 'P1',
      progress: { itemsDone: 3, itemsTotal: 8 },
      readiness: { goal: 70, interviewBest: 82, interviewReady: true },
    })
    expect(r.attendance.marks.map((m) => [m.sessionId, m.status, m.skipped, m.note])).toEqual([
      ['s3', null, 'not_taken', null],
      ['s2', 'absent', null, null],
      ['s1', 'present', null, 'Left early for work'],
    ])
    expect(r.attendance.sessionsCounted).toBe(2)
    // Blank notes are dropped; a staff member who no longer exists is just "Staff".
    expect(r.notes.attendance.map((n) => [n.sessionId, n.markedBy])).toEqual([
      ['s3', 'Staff'],
      ['s1', 'Olu Org'],
    ])
    expect(r.notes.attendance.every((n) => n.cohortName === 'Fall 2026')).toBe(true)
  })

  it('passes the range and timezone to the activity report', async () => {
    await service.record('staff-p1', 'provider-admin', 'C1', 'learner-1', {
      from: '2026-09-01',
      to: '2026-09-30',
      tz: 'America/New_York',
    })
    expect(activity.learnerReport).toHaveBeenCalledWith(
      'staff-p1',
      'provider-admin',
      'C1',
      'learner-1',
      '2026-09-01',
      '2026-09-30',
      'America/New_York'
    )
  })

  it('never carries compensation fields', async () => {
    const text = JSON.stringify(await ask('staff-p1', 'provider-admin'))
    expect(text).not.toMatch(/ompensation/)
  })
})
