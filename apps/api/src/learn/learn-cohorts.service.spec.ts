import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'
import { LearnCohortsService } from './learn-cohorts.service'
import type { LearnService } from './learn.service'
import type { LearnerService } from './learner.service'

const prisma = {
  institution: { findFirst: jest.fn(), findMany: jest.fn() },
  course: { findMany: jest.fn(), findUnique: jest.fn() },
  cohort: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  enrollment: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  membership: { upsert: jest.fn() },
  user: { findUnique: jest.fn() },
  courseOffer: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
}
const learn = { assertRole: jest.fn(), assertWorkspace: jest.fn() }
const learner = { recomputeCompletion: jest.fn() }
const service = new LearnCohortsService(
  prisma as unknown as PrismaService,
  learn as unknown as LearnService,
  learner as unknown as LearnerService
)

const ws = { id: 'w1', name: 'Harbor Point', kind: 'provider', subdomain: 'harborpoint' }
const runnable = [{ id: 'c1', title: 'MA', lengthWeeks: 16, provider: { name: 'Harbor Point' } }]
const future = new Date('2099-01-01T00:00:00Z')

function cohortRow(over: object = {}) {
  return {
    id: 'k1',
    name: 'MA 2099',
    joinKey: 'ABCD2345',
    startsAt: future,
    endsAt: new Date('2099-04-23T00:00:00Z'),
    institution: { id: 'w1', name: 'Harbor Point', subdomain: 'harborpoint' },
    course: { id: 'c1', title: 'MA', lengthWeeks: 16, modules: [{ _count: { items: 5 } }] },
    ...over,
  }
}

beforeEach(() => {
  jest.resetAllMocks()
  prisma.institution.findFirst.mockResolvedValue(ws)
  prisma.course.findMany.mockResolvedValue(runnable)
  prisma.cohort.findFirst.mockResolvedValue(null) // join key free
  prisma.cohort.findUnique.mockResolvedValue(null)
  prisma.enrollment.findMany.mockResolvedValue([])
})

describe('create', () => {
  const body = { courseId: 'c1', name: 'Fall', startsAt: '2099-01-01' }

  it('rejects a course this workspace cannot run', async () => {
    prisma.course.findMany.mockResolvedValue([])
    await expect(service.create('u', 'agency-admin', 'harborpoint', body)).rejects.toThrow(
      BadRequestException
    )
  })

  it('needs a course length, since a cohort lasts exactly that long', async () => {
    prisma.course.findMany.mockResolvedValue([{ ...runnable[0], lengthWeeks: null }])
    await expect(service.create('u', 'agency-admin', 'harborpoint', body)).rejects.toThrow(/length/)
  })

  it('sets the end from the start and course length, and generates a join code', async () => {
    prisma.cohort.create.mockResolvedValue({ id: 'k1' })
    prisma.cohort.findUnique.mockResolvedValue(cohortRow())
    await service.create('u', 'agency-admin', 'harborpoint', body)
    const data = prisma.cohort.create.mock.calls[0][0].data
    expect(data.institutionId).toBe('w1')
    expect(data.endsAt.toISOString()).toBe('2099-04-23T00:00:00.000Z')
    expect(data.joinKey).toMatch(/^[A-Z2-9]{8}$/)
  })

  it('stores the size limit, and checks codes without regard to case', async () => {
    prisma.cohort.create.mockResolvedValue({ id: 'k1' })
    prisma.cohort.findUnique.mockResolvedValue(cohortRow())
    await service.create('u', 'agency-admin', 'harborpoint', { ...body, maxLearners: 30 })
    expect(prisma.cohort.create.mock.calls[0][0].data.maxLearners).toBe(30)
    expect(prisma.cohort.findFirst.mock.calls[0][0].where.joinKey.mode).toBe('insensitive')
  })

  it('does not let an agency run cohorts', async () => {
    prisma.institution.findFirst.mockResolvedValue({ ...ws, kind: 'agency' })
    await expect(service.create('u', 'agency-admin', 'harborpoint', body)).rejects.toThrow(
      BadRequestException
    )
  })
})

describe('update', () => {
  it('moves the end with the start while the cohort has not started', async () => {
    prisma.cohort.findUnique.mockResolvedValue(cohortRow())
    await service.update('u', 'agency-admin', 'k1', { startsAt: '2099-02-01' })
    expect(prisma.cohort.update.mock.calls[0][0].data.endsAt.toISOString()).toBe(
      '2099-05-24T00:00:00.000Z'
    )
  })

  it('refuses to move the start of a cohort that is running', async () => {
    prisma.cohort.findUnique.mockResolvedValue(
      cohortRow({
        startsAt: new Date('2020-01-01T00:00:00Z'),
        endsAt: new Date('2099-01-01T00:00:00Z'),
      })
    )
    await expect(
      service.update('u', 'agency-admin', 'k1', { startsAt: '2099-02-01' })
    ).rejects.toThrow(ConflictException)
  })
})

describe('addLearner', () => {
  beforeEach(() => prisma.cohort.findUnique.mockResolvedValue(cohortRow()))

  it('explains that the person must sign in first and offers the join code', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    await expect(
      service.addLearner('u', 'agency-admin', 'k1', { email: 'ann@example.com' })
    ).rejects.toThrow(/ABCD2345/)
  })

  it('looks up the email among LearnDifferently users only', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    await service
      .addLearner('u', 'agency-admin', 'k1', { email: 'Ann@Example.com' })
      .catch(() => undefined)
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email_source: { email: 'ann@example.com', source: 'learn' } },
    })
  })

  it('rejects someone already enrolled, and re-enrolls someone who withdrew', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'l1' })
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', status: 'enrolled' })
    await expect(
      service.addLearner('u', 'agency-admin', 'k1', { email: 'ann@example.com' })
    ).rejects.toThrow(ConflictException)
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', status: 'withdrawn' })
    await service.addLearner('u', 'agency-admin', 'k1', { email: 'ann@example.com' })
    expect(prisma.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { status: 'enrolled' },
    })
  })
})

describe('recompute', () => {
  it('recomputes the learner after checking the staff member may manage the cohort', async () => {
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', cohortId: 'k1' })
    prisma.cohort.findUnique.mockResolvedValue(cohortRow())
    learner.recomputeCompletion.mockResolvedValue({ change: 'reopened' })
    const out = await service.recompute('u', 'agency-admin', 'e1')
    expect(learner.recomputeCompletion).toHaveBeenCalledWith('e1')
    expect(out.change).toBe('reopened')
    expect(out.cohort.id).toBe('k1')
  })

  it('refuses an enrollment that does not exist, and does not recompute it', async () => {
    learner.recomputeCompletion.mockClear()
    prisma.enrollment.findUnique.mockResolvedValue(null)
    await expect(service.recompute('u', 'agency-admin', 'nope')).rejects.toThrow(NotFoundException)
    expect(learner.recomputeCompletion).not.toHaveBeenCalled()
  })
})

describe('unoffer', () => {
  it('will not take a course back from an organization that has cohorts of it', async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: 'c1',
      provider: { id: 'w1', subdomain: 'harborpoint', parentId: 'a1' },
    })
    prisma.institution.findFirst.mockResolvedValue({ id: 'o1' })
    prisma.cohort.count.mockResolvedValue(1)
    await expect(service.unoffer('u', 'agency-admin', 'c1', 'wilmington')).rejects.toThrow(
      ConflictException
    )
    expect(prisma.courseOffer.deleteMany).not.toHaveBeenCalled()
  })

  it('reports an unknown organization', async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: 'c1',
      provider: { id: 'w1', subdomain: 'harborpoint', parentId: 'a1' },
    })
    prisma.institution.findFirst.mockResolvedValue(null)
    await expect(service.unoffer('u', 'agency-admin', 'c1', 'nope')).rejects.toThrow(
      NotFoundException
    )
  })
})

describe('size limit', () => {
  beforeEach(() => prisma.cohort.findUnique.mockResolvedValue(cohortRow({ maxLearners: 2 })))

  it('will not add a learner to a full cohort', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'l1' })
    prisma.enrollment.findUnique.mockResolvedValue(null)
    prisma.enrollment.count.mockResolvedValue(2)
    await expect(
      service.addLearner('u', 'agency-admin', 'k1', { email: 'a@b.co' })
    ).rejects.toThrow(/full/)
    expect(prisma.enrollment.create).not.toHaveBeenCalled()
  })

  it('adds a learner while there is room, counting only people who have not withdrawn', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'l1' })
    prisma.enrollment.findUnique.mockResolvedValue(null)
    prisma.enrollment.count.mockResolvedValue(1)
    await service.addLearner('u', 'agency-admin', 'k1', { email: 'a@b.co' })
    expect(prisma.enrollment.count).toHaveBeenCalledWith({
      where: { cohortId: 'k1', status: { not: 'withdrawn' } },
    })
    expect(prisma.enrollment.create).toHaveBeenCalled()
  })

  it('will not lower the limit below the people already in', async () => {
    prisma.enrollment.count.mockResolvedValue(5)
    await expect(service.update('u', 'agency-admin', 'k1', { maxLearners: 3 })).rejects.toThrow(
      /5 learners/
    )
    expect(prisma.cohort.update).not.toHaveBeenCalled()
  })

  it('lets the limit be cleared', async () => {
    await service.update('u', 'agency-admin', 'k1', { maxLearners: null })
    expect(prisma.cohort.update.mock.calls[0][0].data.maxLearners).toBeNull()
  })
})
