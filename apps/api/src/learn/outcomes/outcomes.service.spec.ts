import type { PrismaService } from '../../prisma/prisma.service'
import type { DataAccessLogService } from '../data-access-log.service'
import type { ProviderAccessService } from '../provider-access.service'
import { OutcomesService } from './outcomes.service'

// A tiny in-memory stand-in for the three tables the service reads, filtered like Prisma would.
interface Row {
  id: string
  userId: string
  cohortId: string
  status: string
  completedAt: Date | null
  courseId: string
  progress: Record<string, unknown>[]
  plan: Record<string, unknown>[]
}

const PAST = new Date('2020-01-01T00:00:00Z')
const FUTURE = new Date('2099-01-01T00:00:00Z')

const course = (id: string) => ({
  id,
  title: `Course ${id}`,
  targetScore: 75,
  readinessThreshold: 70,
  skills: [{ id: 'sql', label: 'SQL', targetPct: 70 }],
})
const modules = [
  {
    courseId: 'c1',
    items: [
      { id: 'pre1', type: 'knowledge_check', title: 'Pre', label: 'pre', config: {} },
      {
        id: 'q1',
        type: 'knowledge_check',
        title: 'Quiz',
        label: null,
        config: { questions: [{ id: 'a', skill: 'sql' }] },
      },
      { id: 'int1', type: 'interview', title: 'Interview', label: null, config: {} },
    ],
  },
  {
    courseId: 'c2',
    items: [{ id: 'l2', type: 'lesson', title: 'Lesson', label: null, config: {} }],
  },
]

function build(rows: Row[]) {
  const enrollment = {
    findMany: jest.fn(async ({ where }: { where: { userId: string; status: { not: string } } }) =>
      rows
        .filter((r) => r.userId === where.userId && r.status !== where.status.not)
        .map((r) => ({
          ...r,
          cohort: {
            name: `Cohort ${r.cohortId}`,
            startsAt: PAST,
            endsAt: FUTURE,
            institution: { name: 'Harbor' },
            course: course(r.courseId),
          },
        }))
    ),
  }
  const courseModule = {
    findMany: jest.fn(async ({ where }: { where: { courseId: { in: string[] } } }) =>
      modules.filter((m) => where.courseId.in.includes(m.courseId))
    ),
  }
  const prisma = { enrollment, courseModule } as unknown as PrismaService
  return new OutcomesService(prisma, {} as ProviderAccessService, {} as DataAccessLogService)
}

const done = (itemId: string, score: number | null, attempts = 1, data: unknown = null) => ({
  itemId,
  status: 'completed',
  score,
  attempts,
  completedAt: new Date('2026-10-01T10:00:00Z'),
  data,
})

const mine: Row = {
  id: 'e1',
  userId: 'me',
  cohortId: 'k1',
  status: 'enrolled',
  completedAt: null,
  courseId: 'c1',
  progress: [
    done('pre1', 40),
    done('q1', 0, 2, { results: [{ id: 'a', correct: false }] }),
    done('int1', 85, 3),
  ],
  plan: [],
}
const mine2: Row = {
  id: 'e2',
  userId: 'me',
  cohortId: 'k2',
  status: 'completed',
  completedAt: new Date('2026-09-01T00:00:00Z'),
  courseId: 'c2',
  progress: [{ ...done('l2', null, 1) }],
  plan: [],
}
const withdrawn: Row = { ...mine, id: 'e3', cohortId: 'k3', status: 'withdrawn' }
const someoneElse: Row = {
  ...mine,
  id: 'e4',
  userId: 'other',
  cohortId: 'k4',
  progress: [done('pre1', 97)],
}

describe('OutcomesService.mine', () => {
  it('returns an empty, honest result for a learner with no enrollments', async () => {
    const out = await build([someoneElse]).mine('nobody')
    expect(out.cohorts).toEqual([])
    expect(out.totals).toEqual({
      cohorts: 0,
      completedCohorts: 0,
      itemsDone: 0,
      itemsTotal: 0,
      attempts: 0,
    })
  })

  it('covers two cohorts, leaving out withdrawn ones and anyone else', async () => {
    const out = await build([mine, mine2, withdrawn, someoneElse]).mine('me')
    expect(out.cohorts.map((c) => c.cohortId)).toEqual(['k1', 'k2'])
    expect(out.totals).toMatchObject({
      cohorts: 2,
      completedCohorts: 1,
      itemsDone: 4,
      itemsTotal: 4,
      // Only scored items count: the lesson has no score.
      attempts: 6,
    })
  })

  it('never carries another learner or their scores', async () => {
    const out = await build([mine, someoneElse]).mine('me')
    const text = JSON.stringify(out)
    expect(text).not.toContain('k4')
    expect(text).not.toContain('other')
    expect(text).not.toContain('"score":97')
    expect(out.cohorts[0].items.find((i) => i.itemId === 'pre1')?.score).toBe(40)
  })

  it('builds progress, readiness, skills and item results for a cohort', async () => {
    const [c] = (await build([mine]).mine('me')).cohorts
    expect(c).toMatchObject({
      courseTitle: 'Course c1',
      host: 'Harbor',
      status: 'running',
      itemsDone: 3,
      itemsTotal: 3,
      percent: 100,
    })
    expect(c.readiness).toMatchObject({
      pre: 40,
      post: null,
      interviewBest: 85,
      interviewReady: true,
      completed: false,
    })
    expect(c.skills).toEqual([{ id: 'sql', label: 'SQL', pct: 0, targetPct: 70, flagged: true }])
    expect(c.items.find((i) => i.itemId === 'int1')).toMatchObject({ score: 85, attempts: 3 })
  })

  it('does not show a skill as flagged without evidence, and has no staff or pay fields', async () => {
    const fresh: Row = { ...mine, progress: [] }
    const out = await build([fresh]).mine('me')
    expect(out.cohorts[0].skills[0]).toMatchObject({ pct: null, flagged: false })
    expect(out.cohorts[0].percent).toBe(0)
    expect(JSON.stringify(out)).not.toMatch(/ompensation|note|support/)
  })

  it('marks review rows, pre-checks and whether the course has an interview', async () => {
    const withReview: Row = {
      ...mine,
      plan: [{ itemId: 'q1', createdAt: new Date('2026-09-30T00:00:00Z') }] as Row['plan'],
    }
    const out = await build([withReview, mine2]).mine('me')
    const [c1, c2] = out.cohorts
    expect(c1.hasInterview).toBe(true)
    expect(c2.hasInterview).toBe(false)
    expect(c1.items.find((i) => i.itemId === 'pre1')).toMatchObject({
      preCheck: true,
      review: false,
    })
    const rev = c1.items.find((i) => i.title === 'Review: Quiz')
    expect(rev).toMatchObject({ review: true, preCheck: false })
    expect(c1.items.filter((i) => i.itemId === 'q1')).toHaveLength(2)
  })
})

describe('the profile requirement (#69)', () => {
  const monthsAgo = (n: number) => new Date(Date.now() - n * 30.5 * 86_400_000)
  const lesson = { id: 'l1', type: 'lesson', title: 'Lesson', label: null, config: {} }
  const own = { id: 'pi', type: 'profile', title: 'Talent profile', label: null, config: {} }

  function make(opts: {
    cohort?: Record<string, unknown>
    items: unknown[]
    profile?: Record<string, unknown> | null
    progress?: Record<string, unknown>[]
  }) {
    const talentProfile = {
      findUnique: jest.fn(async () =>
        opts.profile === undefined || opts.profile === null
          ? null
          : {
              completedAt: monthsAgo(1),
              updatedAt: monthsAgo(1),
              resumeKey: 'talent/resumes/u/cv.pdf',
              yearsExperience: 1,
              industries: ['x'],
              targetRoles: ['y'],
              _count: { educations: 1 },
              ...opts.profile,
            }
      ),
    }
    const prisma = {
      enrollment: {
        findMany: jest.fn(async () => [
          {
            id: 'e1',
            userId: 'me',
            cohortId: 'k1',
            status: 'enrolled',
            completedAt: null,
            progress: opts.progress ?? [],
            plan: [],
            cohort: {
              name: 'Cohort',
              startsAt: PAST,
              endsAt: FUTURE,
              requiresProfile: false,
              profileRefreshMonths: null,
              institution: { name: 'Harbor' },
              course: course('c9'),
              ...opts.cohort,
            },
          },
        ]),
      },
      courseModule: { findMany: jest.fn(async () => [{ courseId: 'c9', items: opts.items }]) },
      talentProfile,
    } as unknown as PrismaService
    return {
      service: new OutcomesService(prisma, {} as ProviderAccessService, {} as DataAccessLogService),
      talentProfile,
    }
  }
  const REQUIRE = { requiresProfile: true, profileRefreshMonths: 6 }

  it('is unchanged when the profile is not required: no lookup, no extra row', async () => {
    const { service, talentProfile } = make({ items: [lesson] })
    const c = (await service.mine('me')).cohorts[0]
    expect(c.items.map((i) => i.itemId)).toEqual(['l1'])
    expect(c).toMatchObject({ itemsDone: 0, itemsTotal: 1 })
    expect(talentProfile.findUnique).not.toHaveBeenCalled()
  })
  it('counts "Your profile" as a first item, done only while the profile satisfies the rule', async () => {
    let r = make({ cohort: REQUIRE, items: [lesson], profile: null })
    let c = (await r.service.mine('me')).cohorts[0]
    expect(c.items[0]).toMatchObject({ itemId: 'profile', type: 'profile', status: 'not_started' })
    expect(c).toMatchObject({ itemsDone: 0, itemsTotal: 2 })

    r = make({ cohort: REQUIRE, items: [lesson], profile: {} })
    c = (await r.service.mine('me')).cohorts[0]
    expect(c.items[0].status).toBe('completed')
    expect(c).toMatchObject({ itemsDone: 1, itemsTotal: 2 })

    r = make({ cohort: REQUIRE, items: [lesson], profile: { updatedAt: monthsAgo(8) } })
    c = (await r.service.mine('me')).cohorts[0]
    expect(c.items[0].status).toBe('in_progress')
    expect(c.itemsDone).toBe(0)

    r = make({ cohort: REQUIRE, items: [lesson], profile: { _count: { educations: 0 } } })
    expect((await r.service.mine('me')).cohorts[0].items[0].status).toBe('in_progress')
  })
  it('uses the course profile item by state, not a progress row, and adds nothing extra', async () => {
    const r = make({
      cohort: REQUIRE,
      items: [lesson, own],
      profile: null,
      progress: [done('pi', null)],
    })
    const c = (await r.service.mine('me')).cohorts[0]
    expect(c.items.find((i) => i.itemId === 'pi')?.status).toBe('not_started')
    expect(c.items.map((i) => i.itemId)).toEqual(['l1', 'pi'])
    expect(c.itemsTotal).toBe(2)
  })
})
