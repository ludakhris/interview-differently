import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { PrismaService } from '../../prisma/prisma.service'
import { ProviderAccessService } from '../provider-access.service'
import { LearnService } from '../learn.service'
import { toolLaunchTime } from './activity-rules'
import {
  activityCsv,
  csvCell,
  decideBeat,
  daysInclusive,
  eachDay,
  parseRange,
  splitToolEstimate,
} from './activity-rules'
import { ActivityService } from './activity.service'

const T0 = new Date('2026-10-07T12:00:00.000Z')
const at = (s: number, base = T0) => new Date(base.getTime() + s * 1000)

// ── in-memory prisma for the heartbeat ───────────────────────────────────────
interface Row {
  id: string
  userId: string
  enrollmentId: string
  itemId: string | null
  kind: string
  day: Date
  startedAt: Date
  lastSeenAt: Date
  seconds: number
  estimated: boolean
}
let rows: Row[]
let nextId = 0
const enrollments: Record<string, { id: string; status: string; cohort: object }> = {}
const cohortOpen = { courseId: 'course-1', startsAt: new Date('2026-09-01'), endsAt: null }
const items = [
  { id: 'item-1', courseId: 'course-1' },
  { id: 'item-2', courseId: 'course-1' },
  { id: 'other', courseId: 'course-2' },
]

const prisma = {
  enrollment: {
    findUnique: jest.fn(async ({ where }) => {
      const { cohortId, userId } = where.cohortId_userId
      return enrollments[`${cohortId}:${userId}`] ?? null
    }),
  },
  courseItem: {
    findFirst: jest.fn(
      async ({ where }) =>
        items.find((i) => i.id === where.id && i.courseId === where.module.courseId) ?? null
    ),
  },
  activitySession: {
    findFirst: jest.fn(async ({ where }) => {
      const m = rows
        .filter(
          (r) =>
            r.enrollmentId === where.enrollmentId &&
            r.kind === where.kind &&
            r.estimated === where.estimated &&
            r.day.getTime() === where.day.getTime()
        )
        .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      return m[0] ?? null
    }),
    updateMany: jest.fn(async ({ where, data }) => {
      const r = rows.find(
        (x) => x.id === where.id && x.lastSeenAt.getTime() === where.lastSeenAt.getTime()
      )
      if (!r) return { count: 0 }
      r.seconds += data.seconds.increment
      r.lastSeenAt = data.lastSeenAt
      return { count: 1 }
    }),
    create: jest.fn(async ({ data }) => {
      rows.push({ id: `r${nextId++}`, ...data })
      return data
    }),
  },
}
const access = {
  assertCohortStaff: jest.fn(),
  assertLearnerOfCohort: jest.fn(),
}
const svc = new ActivityService(
  prisma as unknown as PrismaService,
  access as unknown as ProviderAccessService,
  {} as never
)
const beat = (userId: string, body: object, now: Date) => svc.heartbeat(userId, body, now)
const total = (enrollmentId = 'E1') =>
  rows.filter((r) => r.enrollmentId === enrollmentId).reduce((n, r) => n + r.seconds, 0)

beforeEach(() => {
  rows = []
  nextId = 0
  for (const k of Object.keys(enrollments)) delete enrollments[k]
  enrollments['C1:learner'] = { id: 'E1', status: 'enrolled', cohort: cohortOpen }
  enrollments['C1:other'] = { id: 'E2', status: 'enrolled', cohort: cohortOpen }
  enrollments['C1:gone'] = { id: 'E3', status: 'withdrawn', cohort: cohortOpen }
  jest.clearAllMocks()
})

describe('heartbeat rules', () => {
  const b = { cohortId: 'C1', itemId: 'item-1', kind: 'page' }

  it('opens a row at 0 s, then adds the real gap', async () => {
    await beat('learner', b, T0)
    expect(rows).toHaveLength(1)
    expect(rows[0].seconds).toBe(0)
    await beat('learner', b, at(30))
    await beat('learner', b, at(60))
    expect(rows).toHaveLength(1)
    expect(rows[0].seconds).toBe(60)
  })

  it('ignores rapid beats (under 10 s apart)', async () => {
    await beat('learner', b, T0)
    for (let s = 1; s < 10; s++) await beat('learner', b, at(s))
    expect(total()).toBe(0)
    await beat('learner', b, at(10))
    expect(total()).toBe(10)
  })

  it('a flood of beats cannot earn more than wall-clock time', async () => {
    for (let s = 0; s <= 300; s++) await beat('learner', b, at(s))
    expect(total()).toBeLessThanOrEqual(300)
  })

  it('caps one beat at 60 s and starts a new row after a huge gap', async () => {
    await beat('learner', b, T0)
    await beat('learner', b, at(75)) // inside the 90 s window: adds 60, not 75
    expect(total()).toBe(60)
    await beat('learner', b, at(75 + 3600)) // an hour later: new row, adds nothing
    expect(rows).toHaveLength(2)
    expect(total()).toBe(60)
  })

  it('alternating items cannot earn time in parallel', async () => {
    const x = { ...b, itemId: 'item-1' }
    const y = { ...b, itemId: 'item-2' }
    await beat('learner', x, T0)
    await beat('learner', y, T0)
    for (let s = 10; s <= 100; s += 10) {
      await beat('learner', x, at(s))
      await beat('learner', y, at(s))
    }
    expect(total()).toBeLessThanOrEqual(100)
  })

  it('does not count an item of another course', async () => {
    await beat('learner', { ...b, itemId: 'other' }, T0)
    await beat('learner', { ...b, itemId: 'nope' }, at(30))
    expect(rows).toHaveLength(0)
  })

  it('stores a page with no item (null)', async () => {
    await beat('learner', { cohortId: 'C1', kind: 'page' }, T0)
    expect(rows[0].itemId).toBeNull()
  })

  it('never writes for another user or an unknown cohort', async () => {
    await beat('stranger', b, T0)
    await beat('learner', { ...b, cohortId: 'C-other' }, T0)
    expect(rows).toHaveLength(0)
    // A beat is keyed by the caller: it lands on the caller's own enrollment only.
    await beat('other', b, T0)
    expect(rows.map((r) => r.enrollmentId)).toEqual(['E2'])
    expect(rows[0].userId).toBe('other')
  })

  it('ignores a withdrawn learner, an upcoming cohort and a long-ended cohort', async () => {
    await beat('gone', b, T0)
    enrollments['C1:learner'].cohort = { ...cohortOpen, startsAt: at(3600) }
    await beat('learner', b, T0)
    enrollments['C1:learner'].cohort = { ...cohortOpen, endsAt: new Date('2026-10-05T00:00:00Z') }
    await beat('learner', b, T0)
    expect(rows).toHaveLength(0)
    // Ended a few hours ago: still within the day of grace.
    enrollments['C1:learner'].cohort = { ...cohortOpen, endsAt: at(-3600 * 3) }
    await beat('learner', b, T0)
    expect(rows).toHaveLength(1)
  })

  it('never trusts the browser: kind tool and extra fields are not counted', async () => {
    await beat('learner', { ...b, kind: 'tool' }, T0)
    await beat('learner', { ...b, seconds: 99999, duration: 99999 }, T0)
    await beat('learner', { ...b, seconds: 99999 }, at(30))
    expect(total()).toBe(30)
  })

  it('rejects a malformed body', async () => {
    await expect(svc.heartbeat('learner', {}, T0)).rejects.toThrow(BadRequestException)
    await expect(svc.heartbeat('learner', { cohortId: 5 }, T0)).rejects.toThrow(BadRequestException)
    await expect(
      svc.heartbeat('learner', { cohortId: 'C1', itemId: 7, kind: 'page' }, T0)
    ).rejects.toThrow(BadRequestException)
    await expect(svc.heartbeat('learner', null, T0)).rejects.toThrow(BadRequestException)
  })

  it('midnight rollover opens a new row on the new UTC day; no row spans two days', async () => {
    const before = new Date('2026-10-07T23:59:40.000Z')
    await beat('learner', b, before)
    await beat('learner', b, at(15, before)) // 23:59:55
    await beat('learner', b, at(30, before)) // 00:00:10 next day
    await beat('learner', b, at(60, before)) // 00:00:40
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.startedAt.toISOString().slice(0, 10)).toBe(r.day.toISOString().slice(0, 10))
      expect(r.lastSeenAt.toISOString().slice(0, 10)).toBe(r.day.toISOString().slice(0, 10))
    }
    expect(rows[0].seconds).toBe(15)
    expect(rows[1].seconds).toBe(30)
  })

  it('two tabs beating on the same instant count once', async () => {
    await beat('learner', b, T0)
    const first = prisma.activitySession.updateMany
    await Promise.all([beat('learner', b, at(30)), beat('learner', b, at(30))])
    expect(first).toHaveBeenCalled()
    expect(total()).toBeLessThanOrEqual(30)
  })
})

describe('decideBeat', () => {
  const last = { lastSeenAt: T0, itemId: 'a' }
  it('decides by gap and item', () => {
    expect(decideBeat(null, 'a', T0)).toEqual({ action: 'new' })
    expect(decideBeat(last, 'a', at(9))).toEqual({ action: 'ignore' })
    expect(decideBeat(last, 'a', at(10))).toEqual({ action: 'add', seconds: 10 })
    expect(decideBeat(last, 'a', at(90))).toEqual({ action: 'add', seconds: 60 })
    expect(decideBeat(last, 'a', at(91))).toEqual({ action: 'new' })
    expect(decideBeat(last, 'b', at(30))).toEqual({ action: 'new' })
    // A clock that went backwards is too soon, not negative time.
    expect(decideBeat(last, 'a', at(-30))).toEqual({ action: 'ignore' })
  })
})

describe('tool estimate', () => {
  it('is capped at 4 hours and never negative', () => {
    const long = splitToolEstimate(T0, at(10 * 3600))
    expect(long.reduce((n, p) => n + p.seconds, 0)).toBe(4 * 3600)
    expect(splitToolEstimate(at(100), T0)).toEqual([])
    expect(splitToolEstimate(T0, T0)).toEqual([])
    expect(splitToolEstimate(new Date(NaN), T0)).toEqual([])
  })
  it('splits at UTC midnight', () => {
    const parts = splitToolEstimate(
      new Date('2026-10-07T23:30:00Z'),
      new Date('2026-10-08T00:10:00Z')
    )
    expect(parts.map((p) => [p.day, p.seconds])).toEqual([
      ['2026-10-07', 1800],
      ['2026-10-08', 600],
    ])
  })
  it('writes estimated rows of kind tool', async () => {
    await svc.recordToolEstimate('E1', 'learner', 'item-1', T0, at(600))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'tool', estimated: true, seconds: 600 })
    await svc.recordToolEstimate('E1', 'learner', 'item-1', at(600), T0)
    expect(rows).toHaveLength(1)
  })
  it('reads a launch time only when it is honest', () => {
    const now = at(1000)
    expect(toolLaunchTime(undefined, now)).toBeNull()
    expect(toolLaunchTime({}, now)).toBeNull()
    expect(toolLaunchTime({ launchedAt: 'junk' }, now)).toBeNull()
    expect(toolLaunchTime({ launchedAt: at(2000).toISOString() }, now)).toBeNull()
    // launched before the previous score came back: belongs to an earlier attempt
    expect(
      toolLaunchTime({ launchedAt: at(100).toISOString(), at: at(200).toISOString() }, now)
    ).toBeNull()
    expect(toolLaunchTime({ launchedAt: at(100).toISOString() }, now)?.toISOString()).toBe(
      at(100).toISOString()
    )
  })
})

describe('range', () => {
  const now = new Date('2026-10-07T08:00:00Z')
  it('defaults to the last 30 days', () => {
    expect(parseRange(undefined, undefined, now)).toEqual({
      range: { from: '2026-09-08', to: '2026-10-07' },
    })
  })
  it('rejects bad dates, reversed and over-long ranges', () => {
    expect('error' in parseRange('2026-13-01', undefined, now)).toBe(true)
    expect('error' in parseRange('2026-02-30', undefined, now)).toBe(true)
    expect('error' in parseRange('yesterday', undefined, now)).toBe(true)
    expect('error' in parseRange('2026-10-07', '2026-10-01', now)).toBe(true)
    expect('error' in parseRange('2025-01-01', '2026-10-07', now)).toBe(true)
    expect('error' in parseRange('2025-10-06', '2026-10-07', now)).toBe(true) // 367 days
    expect('error' in parseRange('2025-10-07', '2026-10-07', now)).toBe(false) // 366 days
  })
  it('lists every day', () => {
    expect(eachDay('2026-02-27', '2026-03-02')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ])
    expect(daysInclusive('2026-10-07', '2026-10-07')).toBe(1)
  })
})

describe('csv', () => {
  it('neutralizes formulas and escapes', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('-2')).toBe("'-2")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('\tcmd')).toBe("'\tcmd")
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"')
    expect(csvCell(null)).toBe('')
    expect(csvCell(12)).toBe('12')
  })
  it('writes the header and one line per row, minutes with one decimal', () => {
    const out = activityCsv([
      {
        name: '=evil()',
        email: 'a@x.org',
        day: '2026-10-07',
        item: 'Intro, part 1',
        kind: 'page',
        seconds: 90,
        estimated: false,
      },
      {
        name: 'Pat',
        email: null,
        day: '2026-10-07',
        item: 'Tool',
        kind: 'tool',
        seconds: 600,
        estimated: true,
      },
    ])
    expect(out.split('\r\n')).toEqual([
      'learner,email,date,item,kind,minutes,estimated',
      '\'=evil(),a@x.org,2026-10-07,"Intro, part 1",page,1.5,no',
      'Pat,,2026-10-07,Tool,tool,10.0,yes',
      '',
    ])
  })
})

describe('access', () => {
  // The real guards, with the same fakes as the roster rule: role first, then workspace.
  const learn = {
    assertRole: LearnService.prototype.assertRole,
    assertWorkspace: jest.fn(async (_u: string, _r: string, sub: string) => {
      if (sub !== 'org-one') throw new ForbiddenException('No access to this workspace')
    }),
  }
  const p = {
    cohort: {
      findUnique: jest.fn(async () => ({
        id: 'C1',
        delivery: 'online',
        courseId: 'c',
        institution: { id: 'O1', subdomain: 'org-one' },
        course: { id: 'c', providerId: 'P1' },
      })),
    },
    enrollment: {
      findUnique: jest.fn(async ({ where }) =>
        where.cohortId_userId.userId === 'learner' ? { id: 'E1' } : null
      ),
    },
  }
  const real = new ProviderAccessService(
    p as unknown as PrismaService,
    learn as unknown as LearnService
  )
  const guarded = new ActivityService(prisma as unknown as PrismaService, real, {} as never)

  it('a learner (no role) gets 403 on every staff report and the CSV', async () => {
    await expect(
      guarded.cohortReport('learner', undefined, 'C1', undefined, undefined)
    ).rejects.toThrow(ForbiddenException)
    await expect(
      guarded.cohortReport('learner', 'case-manager', 'C1', undefined, undefined)
    ).rejects.toThrow(ForbiddenException)
    await expect(
      guarded.learnerReport('learner', undefined, 'C1', 'learner', undefined, undefined)
    ).rejects.toThrow(ForbiddenException)
    await expect(
      guarded.cohortCsv('learner', undefined, 'C1', undefined, undefined)
    ).rejects.toThrow(ForbiddenException)
  })
  it('staff of another workspace is refused by the roster guard', async () => {
    learn.assertWorkspace.mockRejectedValueOnce(
      new ForbiddenException('No access to this workspace')
    )
    await expect(
      guarded.cohortReport('x', 'provider-admin', 'C1', undefined, undefined)
    ).rejects.toThrow(ForbiddenException)
  })
  it('own report: 404 for a cohort the caller is not in, so a learner never reads another cohort', async () => {
    await expect(guarded.ownReport('stranger', 'C1', undefined, undefined)).rejects.toThrow(
      NotFoundException
    )
  })
  it('a bad range is a 400 only after the access check', async () => {
    await expect(
      guarded.cohortReport('learner', undefined, 'C1', 'bad', undefined)
    ).rejects.toThrow(ForbiddenException)
    await expect(guarded.cohortReport('x', 'agency-admin', 'C1', 'bad', undefined)).rejects.toThrow(
      BadRequestException
    )
  })
})
