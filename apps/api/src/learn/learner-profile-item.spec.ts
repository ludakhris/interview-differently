import type { ClerkService } from '../auth/clerk.service'
import type { PrismaService } from '../prisma/prisma.service'
import type { InterviewScoringService } from './interview-scoring.service'
import { LearnerService } from './learner.service'

const PAST = new Date('2020-01-01T00:00:00Z')
const FUTURE = new Date('2099-01-01T00:00:00Z')

const prisma = {
  enrollment: { findMany: jest.fn(), update: jest.fn() },
  courseItem: { findMany: jest.fn() },
  itemProgress: { findMany: jest.fn(), upsert: jest.fn() },
}
const service = new LearnerService(
  prisma as unknown as PrismaService,
  {} as ClerkService,
  {} as InterviewScoringService
)
// Completion is evaluated elsewhere; this only checks it is asked for.
const completeIfDone = jest
  .spyOn(service as unknown as { completeIfDone: () => Promise<void> }, 'completeIfDone')
  .mockResolvedValue(undefined)

const enr = (id: string, startsAt = PAST, endsAt = FUTURE) => ({
  id,
  status: 'enrolled',
  cohort: { startsAt, endsAt, courseId: `course-${id}` },
})

beforeEach(() => {
  jest.clearAllMocks()
  prisma.itemProgress.findMany.mockResolvedValue([])
})

describe('completeProfileItems', () => {
  it('marks the provider profile items done in the learner open cohorts', async () => {
    prisma.enrollment.findMany.mockResolvedValue([enr('e1')])
    prisma.courseItem.findMany.mockResolvedValue([{ id: 'i1' }])
    expect(await service.completeProfileItems('u1', 'P1')).toBe(1)
    expect(prisma.enrollment.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      status: { not: 'withdrawn' },
      cohort: { course: { providerId: 'P1' } },
    })
    expect(prisma.courseItem.findMany.mock.calls[0][0].where).toEqual({
      type: 'profile',
      module: { courseId: 'course-e1' },
    })
    expect(prisma.itemProgress.upsert.mock.calls[0][0]).toMatchObject({
      where: { enrollmentId_itemId: { enrollmentId: 'e1', itemId: 'i1' } },
      create: { status: 'completed' },
    })
    expect(completeIfDone).toHaveBeenCalledWith('e1', 'enrolled', 'course-e1')
  })
  it('skips items already done, cohorts not open, and courses without a profile item', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      enr('e1'),
      enr('e2', FUTURE, FUTURE),
      enr('e3', PAST, PAST),
      enr('e4'),
    ])
    prisma.courseItem.findMany.mockResolvedValueOnce([{ id: 'i1' }]).mockResolvedValueOnce([])
    prisma.itemProgress.findMany.mockResolvedValueOnce([{ itemId: 'i1' }])
    expect(await service.completeProfileItems('u1', 'P1')).toBe(0)
    expect(prisma.itemProgress.upsert).not.toHaveBeenCalled()
    expect(prisma.courseItem.findMany).toHaveBeenCalledTimes(2)
  })
})
