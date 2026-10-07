import { NotFoundException } from '@nestjs/common'
import type { ClerkService } from '../auth/clerk.service'
import type { PrismaService } from '../prisma/prisma.service'
import type { InterviewScoringService } from './interview-scoring.service'
import { LearnerService } from './learner.service'

const PAST = new Date('2020-01-01T00:00:00Z')
const FUTURE = new Date('2099-01-01T00:00:00Z')
const monthsAgo = (n: number) => new Date(Date.now() - n * 30.5 * 86_400_000)

const prisma = {
  enrollment: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  courseItem: { findMany: jest.fn() },
  courseModule: { findMany: jest.fn() },
  course: { findUnique: jest.fn() },
  itemProgress: { findMany: jest.fn(), upsert: jest.fn() },
  planItem: { findMany: jest.fn() },
  talentProfile: { findUnique: jest.fn() },
}
const service = new LearnerService(
  prisma as unknown as PrismaService,
  {} as ClerkService,
  {} as InterviewScoringService
)

/** What loadProfileFacts reads for a person. */
const profile = (over: Record<string, unknown> = {}) => ({
  completedAt: monthsAgo(1),
  updatedAt: monthsAgo(1),
  resumeKey: 'talent/resumes/u/cv.pdf',
  yearsExperience: 3,
  industries: ['Retail'],
  targetRoles: [],
  _count: { educations: 1 },
  ...over,
})

const lesson = { id: 'l1', type: 'lesson', title: 'Intro', label: null, config: {} }
const ownProfile = { id: 'pi', type: 'profile', title: 'Talent profile', label: null, config: {} }
const modules = (...items: (typeof lesson)[]) => [
  { id: 'm1', title: 'Basics', position: 1, courseId: 'c1', items },
]

function enrollment(cohort: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    cohortId: 'k1',
    userId: 'u1',
    status: 'enrolled',
    cohort: {
      name: 'Fall',
      startsAt: PAST,
      endsAt: FUTURE,
      requiresProfile: false,
      profileRefreshMonths: null,
      institution: { name: 'Harbor Point' },
      course: { id: 'c1', title: 'MA', targetScore: 75, readinessThreshold: 70, providerId: 'P1' },
      ...cohort,
    },
  }
}

const REQUIRE = { requiresProfile: true, profileRefreshMonths: null }

beforeEach(() => {
  jest.resetAllMocks()
  prisma.enrollment.findUnique.mockResolvedValue(enrollment())
  prisma.courseModule.findMany.mockResolvedValue(modules(lesson))
  prisma.itemProgress.findMany.mockResolvedValue([])
  prisma.planItem.findMany.mockResolvedValue([])
  prisma.talentProfile.findUnique.mockResolvedValue(null)
  prisma.course.findUnique.mockResolvedValue({ readinessThreshold: 70 })
})

const outline = () => service.outline('u1', 'k1')
const firstItem = async () => (await outline()).modules[0].items[0]

describe('a cohort that does not require the profile', () => {
  it('behaves as before: no profile query, no extra item, counts unchanged', async () => {
    prisma.itemProgress.findMany.mockResolvedValue([{ itemId: 'l1', status: 'completed' }])
    const o = await outline()
    expect(o.modules.map((m) => m.id)).toEqual(['m1'])
    expect(o.cohort).toMatchObject({ itemsDone: 1, itemsTotal: 1 })
    expect(prisma.talentProfile.findUnique).not.toHaveBeenCalled()
  })
  it('a course profile item in it is done when the profile is complete, with no refresh rule', async () => {
    prisma.courseModule.findMany.mockResolvedValue(modules(lesson, ownProfile))
    prisma.talentProfile.findUnique.mockResolvedValue(profile({ updatedAt: monthsAgo(40) }))
    const o = await outline()
    expect(o.modules[0].items.map((i) => [i.id, i.status])).toEqual([
      ['l1', 'not_started'],
      ['pi', 'completed'],
    ])
    expect(o.cohort).toMatchObject({ itemsDone: 1, itemsTotal: 2 })
  })
  it('its state wins over a stale progress row', async () => {
    prisma.courseModule.findMany.mockResolvedValue(modules(ownProfile))
    prisma.itemProgress.findMany.mockResolvedValue([{ itemId: 'pi', status: 'completed' }])
    prisma.talentProfile.findUnique.mockResolvedValue(null)
    expect((await firstItem()).status).toBe('not_started')
  })
})

describe('a cohort that requires the profile', () => {
  beforeEach(() => prisma.enrollment.findUnique.mockResolvedValue(enrollment(REQUIRE)))

  it('puts "Your profile" first, as a profile item that counts toward the totals', async () => {
    const o = await outline()
    expect(o.modules.map((m) => m.title)).toEqual(['Your profile', 'Basics'])
    expect(o.modules[0].items).toEqual([
      expect.objectContaining({
        id: 'profile',
        type: 'profile',
        title: 'Your profile',
        status: 'not_started',
      }),
    ])
    expect(o.cohort).toMatchObject({ itemsDone: 0, itemsTotal: 2 })
  })
  it('is done when the profile is complete', async () => {
    prisma.talentProfile.findUnique.mockResolvedValue(profile())
    const o = await outline()
    expect(o.modules[0].items[0]).toMatchObject({ status: 'completed', note: null })
    expect(o.cohort).toMatchObject({ itemsDone: 1, itemsTotal: 2 })
  })
  it('is in progress, saying so, while the profile is incomplete', async () => {
    prisma.talentProfile.findUnique.mockResolvedValue(profile({ _count: { educations: 0 } }))
    expect(await firstItem()).toMatchObject({
      status: 'in_progress',
      note: 'Finish your profile',
    })
  })
  it('needs a refresh once it is older than the cohort period, and counts as not done', async () => {
    prisma.enrollment.findUnique.mockResolvedValue(
      enrollment({ requiresProfile: true, profileRefreshMonths: 6 })
    )
    prisma.talentProfile.findUnique.mockResolvedValue(profile({ updatedAt: monthsAgo(7) }))
    const o = await outline()
    expect(o.modules[0].items[0]).toMatchObject({
      status: 'in_progress',
      note: 'Time to refresh your profile',
    })
    expect(o.cohort.itemsDone).toBe(0)
    prisma.talentProfile.findUnique.mockResolvedValue(profile({ updatedAt: monthsAgo(5) }))
    expect((await firstItem()).status).toBe('completed')
  })
  it('with no refresh period an old profile never goes stale', async () => {
    prisma.talentProfile.findUnique.mockResolvedValue(profile({ updatedAt: monthsAgo(59) }))
    expect((await firstItem()).status).toBe('completed')
  })
  it('uses the course own profile item, moved to the front, not a second one', async () => {
    prisma.courseModule.findMany.mockResolvedValue(modules(lesson, ownProfile))
    prisma.talentProfile.findUnique.mockResolvedValue(profile())
    const o = await outline()
    expect(o.modules.map((m) => m.title)).toEqual(['Your profile', 'Basics'])
    expect(o.modules[0].items.map((i) => i.id)).toEqual(['pi'])
    expect(o.modules[1].items.map((i) => i.id)).toEqual(['l1'])
    expect(o.cohort).toMatchObject({ itemsDone: 1, itemsTotal: 2 })
  })
  it('drops a module that held only the moved profile item', async () => {
    prisma.courseModule.findMany.mockResolvedValue([
      { id: 'm0', title: 'Profile', position: 0, courseId: 'c1', items: [ownProfile] },
      ...modules(lesson),
    ])
    const o = await outline()
    expect(o.modules.map((m) => m.id)).toEqual(['profile', 'm1'])
  })

  describe('the item page', () => {
    it('opens "Your profile" with its state, and has no body to complete', async () => {
      prisma.talentProfile.findUnique.mockResolvedValue(profile({ _count: { educations: 0 } }))
      const it = await service.item('u1', 'k1', 'profile')
      expect(it).toMatchObject({
        id: 'profile',
        cohortId: 'k1',
        type: 'profile',
        title: 'Your profile',
        status: 'in_progress',
        note: 'Finish your profile',
        locked: null,
      })
    })
    it('is not there when the cohort does not require the profile', async () => {
      prisma.enrollment.findUnique.mockResolvedValue(enrollment())
      await expect(service.item('u1', 'k1', 'profile')).rejects.toThrow(NotFoundException)
    })
    it('is locked outside the cohort dates, like any item', async () => {
      prisma.enrollment.findUnique.mockResolvedValue(enrollment({ ...REQUIRE, startsAt: FUTURE }))
      expect((await service.item('u1', 'k1', 'profile')).locked).toMatch(/not started/)
    })
  })
})

describe('cards', () => {
  const row = (cohort: Record<string, unknown>, progress: { itemId: string }[] = []) => ({
    cohortId: 'k1',
    status: 'enrolled',
    cohort: {
      name: 'Fall',
      startsAt: PAST,
      endsAt: FUTURE,
      requiresProfile: false,
      profileRefreshMonths: null,
      institution: { name: 'Harbor Point' },
      course: { id: 'c1', title: 'MA' },
      ...cohort,
    },
    progress,
    plan: [],
  })
  it('is unchanged without a profile rule or item', async () => {
    prisma.enrollment.findMany.mockResolvedValue([row({}, [{ itemId: 'l1' }])])
    expect(await service.cards('u1')).toEqual([
      expect.objectContaining({ itemsDone: 1, itemsTotal: 1 }),
    ])
    expect(prisma.talentProfile.findUnique).not.toHaveBeenCalled()
  })
  it('counts the synthetic profile item in the total and in done only when satisfied', async () => {
    prisma.enrollment.findMany.mockResolvedValue([row(REQUIRE, [{ itemId: 'l1' }])])
    expect(await service.cards('u1')).toEqual([
      expect.objectContaining({ itemsDone: 1, itemsTotal: 2 }),
    ])
    prisma.talentProfile.findUnique.mockResolvedValue(profile())
    expect(await service.cards('u1')).toEqual([
      expect.objectContaining({ itemsDone: 2, itemsTotal: 2 }),
    ])
  })
  it('counts the course own profile item by state, not by a stale row, with no extra total', async () => {
    prisma.courseModule.findMany.mockResolvedValue(modules(lesson, ownProfile))
    prisma.enrollment.findMany.mockResolvedValue([row(REQUIRE, [{ itemId: 'pi' }])])
    expect(await service.cards('u1')).toEqual([
      expect.objectContaining({ itemsDone: 0, itemsTotal: 2 }),
    ])
    prisma.talentProfile.findUnique.mockResolvedValue(profile())
    expect(await service.cards('u1')).toEqual([
      expect.objectContaining({ itemsDone: 1, itemsTotal: 2 }),
    ])
  })
})

describe('completion', () => {
  const finished = (...ids: string[]) =>
    prisma.itemProgress.findMany.mockResolvedValue(
      ids.map((itemId) => ({ itemId, status: 'completed', completedAt: new Date('2026-09-10Z') }))
    )
  const recompute = (status = 'enrolled', cohort: Record<string, unknown> = {}) => {
    prisma.enrollment.findUnique.mockResolvedValue({
      id: 'e1',
      userId: 'u1',
      status,
      completedAt: null,
      cohort: { courseId: 'c1', requiresProfile: false, profileRefreshMonths: null, ...cohort },
    })
    return service.recomputeCompletion('e1')
  }
  it('is unchanged when the profile is not required: lessons alone complete the course', async () => {
    finished('l1')
    expect(await recompute()).toEqual({ change: 'completed' })
    expect(prisma.talentProfile.findUnique).not.toHaveBeenCalled()
  })
  it('a requiring cohort also needs the profile: finished lessons are not enough', async () => {
    finished('l1')
    expect(await recompute('enrolled', REQUIRE)).toEqual({ change: null })
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
  })
  it('completes once the profile is complete, dated to the later of the lesson and the profile', async () => {
    finished('l1')
    prisma.talentProfile.findUnique.mockResolvedValue(
      profile({ completedAt: new Date('2026-09-20T00:00:00Z') })
    )
    expect(await recompute('enrolled', REQUIRE)).toEqual({ change: 'completed' })
    expect(prisma.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { status: 'completed', completedAt: new Date('2026-09-20T00:00:00Z') },
    })
  })
  it('a stale profile does not satisfy a refresh period, and a fresh one does', async () => {
    finished('l1')
    const cohort = { requiresProfile: true, profileRefreshMonths: 3 }
    prisma.talentProfile.findUnique.mockResolvedValue(profile({ updatedAt: monthsAgo(4) }))
    expect(await recompute('enrolled', cohort)).toEqual({ change: null })
    prisma.talentProfile.findUnique.mockResolvedValue(profile({ updatedAt: monthsAgo(2) }))
    expect(await recompute('enrolled', cohort)).toEqual({ change: 'completed' })
  })
  it('a course profile item in a non-requiring cohort needs the profile too, not a progress row', async () => {
    prisma.courseModule.findMany.mockResolvedValue(modules(lesson, ownProfile))
    finished('l1', 'pi') // a leftover row says done
    expect(await recompute()).toEqual({ change: null })
    prisma.talentProfile.findUnique.mockResolvedValue(profile())
    expect(await recompute()).toEqual({ change: 'completed' })
  })
  it('a course profile item in a requiring cohort is the required item, not a second one', async () => {
    prisma.courseModule.findMany.mockResolvedValue(modules(lesson, ownProfile))
    finished('l1')
    prisma.talentProfile.findUnique.mockResolvedValue(profile())
    expect(await recompute('enrolled', REQUIRE)).toEqual({ change: 'completed' })
  })
  it('a completed record is never reopened by a stale profile except by recompute rules', async () => {
    // completeIfDone leaves a completed enrollment alone; only recomputeCompletion reopens.
    finished('l1')
    prisma.talentProfile.findUnique.mockResolvedValue(profile({ updatedAt: monthsAgo(40) }))
    const call = service as unknown as {
      completeIfDone: (a: string, b: string, c: string) => Promise<void>
    }
    await call.completeIfDone('e1', 'completed', 'c1')
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
  })
})

describe('syncProfileState (after a profile save)', () => {
  const enr = (id: string, cohort: Record<string, unknown> = {}, status = 'enrolled') => ({
    id,
    status,
    cohort: {
      startsAt: PAST,
      endsAt: FUTURE,
      courseId: `course-${id}`,
      requiresProfile: false,
      profileRefreshMonths: null,
      ...cohort,
    },
  })
  let completeIfDone: jest.SpyInstance
  beforeEach(() => {
    completeIfDone = jest
      .spyOn(service as unknown as { completeIfDone: () => Promise<void> }, 'completeIfDone')
      .mockResolvedValue(undefined)
    prisma.courseItem.findMany.mockResolvedValue([{ id: 'pi1', module: { courseId: 'course-e1' } }])
    prisma.talentProfile.findUnique.mockResolvedValue(profile())
  })
  afterEach(() => completeIfDone.mockRestore())

  it('mirrors a finished row for the course profile item and asks about completion', async () => {
    prisma.enrollment.findMany.mockResolvedValue([enr('e1')])
    await service.syncProfileState('u1')
    expect(prisma.enrollment.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      status: 'enrolled',
      cohort: { courseId: { not: null } },
    })
    expect(prisma.itemProgress.upsert.mock.calls[0][0]).toMatchObject({
      where: { enrollmentId_itemId: { enrollmentId: 'e1', itemId: 'pi1' } },
      create: { status: 'completed' },
    })
    expect(completeIfDone).toHaveBeenCalledWith('e1', 'enrolled', 'course-e1')
  })
  it('asks about completion for a requiring cohort even when the course has no profile item', async () => {
    prisma.enrollment.findMany.mockResolvedValue([enr('e2', REQUIRE)])
    await service.syncProfileState('u1')
    expect(prisma.itemProgress.upsert).not.toHaveBeenCalled()
    expect(completeIfDone).toHaveBeenCalledWith('e2', 'enrolled', 'course-e2')
  })
  it('leaves alone: cohorts without a profile need, cohorts not open, an unsatisfied profile, rows already done', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      enr('e3'),
      enr('e1', { startsAt: FUTURE }),
      enr('e1', { endsAt: PAST }),
    ])
    await service.syncProfileState('u1')
    expect(completeIfDone).not.toHaveBeenCalled()

    prisma.enrollment.findMany.mockResolvedValue([enr('e1')])
    prisma.talentProfile.findUnique.mockResolvedValue(profile({ _count: { educations: 0 } }))
    await service.syncProfileState('u1')
    expect(completeIfDone).not.toHaveBeenCalled()

    prisma.talentProfile.findUnique.mockResolvedValue(profile())
    prisma.itemProgress.findMany.mockResolvedValue([{ enrollmentId: 'e1', itemId: 'pi1' }])
    await service.syncProfileState('u1')
    expect(prisma.itemProgress.upsert).not.toHaveBeenCalled()
    expect(completeIfDone).toHaveBeenCalledTimes(1) // still asked: the completion rule may now be met
  })
  it('does nothing for a stale profile in a refresh cohort', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      enr('e2', { requiresProfile: true, profileRefreshMonths: 1 }),
    ])
    prisma.talentProfile.findUnique.mockResolvedValue(profile({ updatedAt: monthsAgo(3) }))
    await service.syncProfileState('u1')
    expect(completeIfDone).not.toHaveBeenCalled()
  })
})
