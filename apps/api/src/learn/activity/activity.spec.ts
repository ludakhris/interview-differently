import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common'
import type { PrismaService } from '../../prisma/prisma.service'
import { ProviderAccessService } from '../provider-access.service'
import { LearnService } from '../learn.service'
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
        .sort(
          (a, b) =>
            b.lastSeenAt.getTime() - a.lastSeenAt.getTime() ||
            b.startedAt.getTime() - a.startedAt.getTime()
        )
      return m[0] ?? null
    }),
    updateMany: jest.fn(async ({ where, data }) => {
      const r = rows.find(
        (x) => x.id === where.id && x.lastSeenAt.getTime() === where.lastSeenAt.getTime()
      )
      if (!r) return { count: 0 }
      if (typeof data.seconds === 'number') r.seconds = data.seconds
      else if (data.seconds) r.seconds += data.seconds.increment
      r.lastSeenAt = data.lastSeenAt
      return { count: 1 }
    }),
    findMany: jest.fn(async ({ where, take }) =>
      rows
        .filter(
          (r) =>
            r.enrollmentId === where.enrollmentId &&
            r.itemId === where.itemId &&
            r.kind === where.kind &&
            r.startedAt.getTime() >= where.startedAt.gte.getTime()
        )
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(0, take)
    ),
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

  it('switching items inside the window credits the gap to the NEW item', async () => {
    const x = { ...b, itemId: 'item-1' }
    const y = { ...b, itemId: 'item-2' }
    await beat('learner', x, T0)
    await beat('learner', x, at(30)) // item-1 has 30 s
    await beat('learner', y, at(60)) // switch: item-2 opens with the 30 s gap
    expect(rows.map((r) => [r.itemId, r.seconds])).toEqual([
      ['item-1', 30],
      ['item-2', 30],
    ])
    await beat('learner', y, at(90)) // same item again: adds to item-2
    expect(rows.find((r) => r.itemId === 'item-2')!.seconds).toBe(60)
    expect(total()).toBe(90)
  })

  it('a switch after the window credits nothing; a long gap is capped at 60 s', async () => {
    const x = { ...b, itemId: 'item-1' }
    const y = { ...b, itemId: 'item-2' }
    await beat('learner', x, T0)
    await beat('learner', y, at(75)) // inside 90 s: min(75, 60)
    expect(rows.find((r) => r.itemId === 'item-2')!.seconds).toBe(60)
    await beat('learner', x, at(75 + 600)) // outside the window
    expect(total()).toBe(60)
  })

  it('two tabs alternating items cannot earn more than the elapsed time', async () => {
    const x = { ...b, itemId: 'item-1' }
    const y = { ...b, itemId: 'item-2' }
    await beat('learner', x, T0)
    // Tab Y beats 5 s after tab X, every 30 s, for 10 minutes; every beat is measured against the latest one.
    for (let s = 0; s <= 600; s += 30) {
      await beat('learner', x, at(s))
      await beat('learner', y, at(s + 15))
    }
    expect(total()).toBeLessThanOrEqual(615)
    expect(total()).toBeGreaterThan(0)
  })

  it('two tabs switching to another item together credit the gap once', async () => {
    await beat('learner', { ...b, itemId: 'item-1' }, T0)
    const y = { ...b, itemId: 'item-2' }
    await Promise.all([beat('learner', y, at(30)), beat('learner', y, at(30))])
    expect(total()).toBeLessThanOrEqual(30)
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
    expect(decideBeat(null, 'a', T0)).toEqual({ action: 'new', seconds: 0 })
    expect(decideBeat(last, 'a', at(9))).toEqual({ action: 'ignore' })
    expect(decideBeat(last, 'a', at(10))).toEqual({ action: 'add', seconds: 10 })
    expect(decideBeat(last, 'a', at(90))).toEqual({ action: 'add', seconds: 60 })
    expect(decideBeat(last, 'a', at(91))).toEqual({ action: 'new', seconds: 0 })
    // A different item inside the window: a row for it, credited the gap (at most 60 s).
    expect(decideBeat(last, 'b', at(30))).toEqual({ action: 'new', seconds: 30 })
    expect(decideBeat(last, 'b', at(80))).toEqual({ action: 'new', seconds: 60 })
    expect(decideBeat(last, 'b', at(95))).toEqual({ action: 'new', seconds: 0 })
    expect(decideBeat(last, 'b', at(5))).toEqual({ action: 'ignore' })
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
})

describe('tool time (launch row, closed at score return)', () => {
  const tool = () => rows.filter((r) => r.kind === 'tool')

  it('a launch writes one open estimated row', async () => {
    await svc.openToolLaunch('E1', 'learner', 'item-1', T0)
    expect(tool()).toHaveLength(1)
    expect(tool()[0]).toMatchObject({
      kind: 'tool',
      estimated: true,
      seconds: 0,
      startedAt: T0,
      lastSeenAt: T0,
      day: new Date('2026-10-07T00:00:00.000Z'),
    })
  })
  it('a relaunch reuses the open row; one older than 4 h gets a new row', async () => {
    await svc.openToolLaunch('E1', 'learner', 'item-1', T0)
    await svc.openToolLaunch('E1', 'learner', 'item-1', at(600))
    expect(tool()).toHaveLength(1)
    await svc.openToolLaunch('E1', 'learner', 'item-1', at(4 * 3600 + 1))
    expect(tool()).toHaveLength(2)
  })
  it('a score closes the row with the elapsed seconds', async () => {
    await svc.openToolLaunch('E1', 'learner', 'item-1', T0)
    await svc.closeToolLaunch('E1', 'item-1', at(600))
    expect(tool()).toHaveLength(1)
    expect(tool()[0]).toMatchObject({ seconds: 600, lastSeenAt: at(600) })
  })
  it('caps at 4 h', async () => {
    await svc.openToolLaunch('E1', 'learner', 'item-1', T0)
    await svc.closeToolLaunch('E1', 'item-1', at(4 * 3600))
    expect(tool()[0].seconds).toBe(4 * 3600)
    // a score 5 h later finds no open launch within 4 h: writes nothing
    await svc.openToolLaunch('E1', 'learner', 'item-1', at(10 * 3600))
    await svc.closeToolLaunch('E1', 'item-1', at(15 * 3600))
    expect(tool().map((r) => r.seconds)).toEqual([4 * 3600, 0])
  })
  it('a score with no launch row writes nothing', async () => {
    await svc.closeToolLaunch('E1', 'item-1', at(600))
    expect(rows).toHaveLength(0)
  })
  it('a repeated score does not count twice', async () => {
    await svc.openToolLaunch('E1', 'learner', 'item-1', T0)
    await svc.closeToolLaunch('E1', 'item-1', at(600))
    await svc.closeToolLaunch('E1', 'item-1', at(900))
    expect(tool()).toHaveLength(1)
    expect(total()).toBe(600)
  })
  it('an instant score still closes the row', async () => {
    await svc.openToolLaunch('E1', 'learner', 'item-1', T0)
    await svc.closeToolLaunch('E1', 'item-1', T0)
    await svc.closeToolLaunch('E1', 'item-1', at(900))
    expect(total()).toBe(0)
  })
  it('splits at UTC midnight', async () => {
    const start = new Date('2026-10-07T23:30:00.000Z')
    await svc.openToolLaunch('E1', 'learner', 'item-1', start)
    await svc.closeToolLaunch('E1', 'item-1', at(2400, start))
    expect(tool().map((r) => [r.day.toISOString().slice(0, 10), r.seconds])).toEqual([
      ['2026-10-07', 1800],
      ['2026-10-08', 600],
    ])
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
  it('writes a BOM, the header and one line per row; measured and estimated minutes apart', () => {
    const out = activityCsv([
      {
        name: '=evil()',
        email: 'a@x.org',
        day: '2026-10-07',
        item: 'Intro, part 1',
        kind: 'page',
        measuredSeconds: 90,
        estimatedSeconds: 0,
      },
      {
        name: 'Pat',
        email: null,
        day: '2026-10-07',
        item: 'Tool',
        kind: 'tool',
        measuredSeconds: 0,
        estimatedSeconds: 600,
      },
    ])
    expect(out.startsWith('\uFEFF')).toBe(true)
    expect(out.slice(1).split('\r\n')).toEqual([
      'learner,email,date,item,kind,measured_minutes,estimated_minutes',
      '\'=evil(),a@x.org,2026-10-07,"Intro, part 1",page,1.5,',
      'Pat,,2026-10-07,Tool,tool,,10.0',
      '',
    ])
  })
})

describe('csv size limit', () => {
  it('refuses more than 100,000 rows with a message asking to narrow the range', async () => {
    const mk = (n: number) =>
      new ActivityService(
        {
          $queryRawUnsafe: jest.fn(async () =>
            Array.from({ length: n }, () => ({
              name: 'A',
              email: null,
              day: '2026-10-07',
              itemId: null,
              title: null,
              kind: 'page',
              measured: 60,
              estimated: 0,
            }))
          ),
        } as unknown as PrismaService,
        access as unknown as ProviderAccessService,
        {} as never
      )
    await expect(mk(100_001).cohortCsv('s', 'r', 'C1', '2026-10-01', '2026-10-07')).rejects.toThrow(
      PayloadTooLargeException
    )
    await expect(mk(100_001).cohortCsv('s', 'r', 'C1', '2026-10-01', '2026-10-07')).rejects.toThrow(
      /shorter date range/
    )
    expect(await mk(3).cohortCsv('s', 'r', 'C1', '2026-10-01', '2026-10-07')).toContain('A,,')
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
