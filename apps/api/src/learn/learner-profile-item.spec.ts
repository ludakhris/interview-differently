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
  talentProfile: { findUnique: jest.fn() },
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
    prisma.courseItem.findMany.mockResolvedValue([{ id: 'i1', module: { courseId: 'course-e1' } }])
    expect(await service.completeProfileItems('u1', 'P1')).toBe(1)
    expect(prisma.enrollment.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      status: { not: 'withdrawn' },
      cohort: { course: { providerId: 'P1' } },
    })
    expect(prisma.courseItem.findMany.mock.calls[0][0].where).toEqual({
      type: 'profile',
      module: { courseId: { in: ['course-e1'] } },
    })
    expect(prisma.itemProgress.upsert.mock.calls[0][0]).toMatchObject({
      where: { enrollmentId_itemId: { enrollmentId: 'e1', itemId: 'i1' } },
      create: { status: 'completed' },
    })
    expect(completeIfDone).toHaveBeenCalledWith('e1', 'enrolled', 'course-e1')
  })
  it('skips items already done, cohorts not open, and courses without a profile item, in two queries', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      enr('e1'),
      enr('e2', FUTURE, FUTURE),
      enr('e3', PAST, PAST),
      enr('e4'),
    ])
    prisma.courseItem.findMany.mockResolvedValue([{ id: 'i1', module: { courseId: 'course-e1' } }])
    prisma.itemProgress.findMany.mockResolvedValueOnce([{ enrollmentId: 'e1', itemId: 'i1' }])
    expect(await service.completeProfileItems('u1', 'P1')).toBe(0)
    expect(prisma.itemProgress.upsert).not.toHaveBeenCalled()
    expect(prisma.courseItem.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.itemProgress.findMany).toHaveBeenCalledTimes(1)
  })
})

describe('catching up a profile completed earlier', () => {
  const catchUp = (providerId: string) =>
    (
      service as unknown as { catchUpProfile: (u: string, p: string) => Promise<boolean> }
    ).catchUpProfile('u1', providerId)
  beforeEach(() => {
    prisma.enrollment.findMany.mockResolvedValue([enr('e1')])
    prisma.courseItem.findMany.mockResolvedValue([{ id: 'i1', module: { courseId: 'course-e1' } }])
  })
  it('marks the item when the profile is already completed', async () => {
    prisma.talentProfile.findUnique.mockResolvedValue({ completedAt: new Date() })
    expect(await catchUp('P1')).toBe(true)
    expect(prisma.itemProgress.upsert).toHaveBeenCalledTimes(1)
  })
  it('does nothing without a completed profile, and is idempotent once marked', async () => {
    prisma.talentProfile.findUnique.mockResolvedValue({ completedAt: null })
    expect(await catchUp('P1')).toBe(false)
    prisma.talentProfile.findUnique.mockResolvedValue({ completedAt: new Date() })
    prisma.itemProgress.findMany.mockResolvedValue([{ enrollmentId: 'e1', itemId: 'i1' }])
    expect(await catchUp('P1')).toBe(false)
    expect(prisma.itemProgress.upsert).not.toHaveBeenCalled()
  })
})
