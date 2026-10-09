import { resetToDefaults, withFirstTool } from '../lti/platform/tool-test-helpers'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { ClerkService } from '../auth/clerk.service'
import type { PrismaService } from '../prisma/prisma.service'
import { setStoredTools } from '../lti/platform/lti-platform-config'
import type { InterviewScoringService } from './interview-scoring.service'
import {
  attemptsAllowed,
  buildRecord,
  LearnerService,
  scormResult,
  scormSrc,
  videoEvidence,
} from './learner.service'

const prisma = {
  user: { findUnique: jest.fn(), create: jest.fn() },
  cohort: { findFirst: jest.fn() },
  enrollment: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  membership: { upsert: jest.fn() },
  joinRequest: { findUnique: jest.fn(), upsert: jest.fn(), findMany: jest.fn() },
  course: { findUnique: jest.fn() },
  courseItem: { findUnique: jest.fn() },
  courseModule: { findMany: jest.fn() },
  itemProgress: { findUnique: jest.fn(), upsert: jest.fn(), count: jest.fn(), findMany: jest.fn() },
  itemAttempt: { findMany: jest.fn(), count: jest.fn() },
  planItem: { findMany: jest.fn(), findUnique: jest.fn(), createMany: jest.fn() },
  $queryRawUnsafe: jest.fn(),
}
const clerk = { getUserProfile: jest.fn() }
const scoring = { score: jest.fn() }
const service = new LearnerService(
  prisma as unknown as PrismaService,
  clerk as unknown as ClerkService,
  scoring as unknown as InterviewScoringService
)

const PAST = new Date('2020-01-01T00:00:00Z')
const FUTURE = new Date('2099-01-01T00:00:00Z')
const quiz = [
  { prompt: 'Pulse?', options: ['20', '70'], correctIndex: 1 },
  { prompt: 'IDs?', options: ['One', 'Two'], correctIndex: 1 },
]

function enrollment(over: { startsAt?: Date; endsAt?: Date; status?: string } = {}) {
  return {
    id: 'e1',
    cohortId: 'k1',
    userId: 'u1',
    status: over.status ?? 'enrolled',
    cohort: {
      name: 'Fall',
      startsAt: over.startsAt ?? PAST,
      endsAt: over.endsAt ?? FUTURE,
      institution: { name: 'Harbor Point' },
      course: { id: 'c1', title: 'MA', targetScore: 75, readinessThreshold: 70 },
    },
  }
}
const item = (type: string, label: string | null = null, config: object = {}) => ({
  id: 'i1',
  type,
  label,
  title: 'Item',
  config,
  module: { courseId: 'c1' },
})

beforeEach(() => {
  jest.resetAllMocks()
  prisma.enrollment.findUnique.mockResolvedValue(enrollment())
  prisma.courseModule.findMany.mockResolvedValue([])
  prisma.itemProgress.count.mockResolvedValue(0)
  prisma.itemProgress.findMany.mockResolvedValue([])
  prisma.itemAttempt.findMany.mockResolvedValue([])
  prisma.planItem.findMany.mockResolvedValue([])
  prisma.planItem.findUnique.mockResolvedValue(null)
})

/** What the completion check reads: these items are finished (just now). */
const finished = (...ids: string[]) =>
  prisma.itemProgress.findMany.mockResolvedValue(
    ids.map((itemId) => ({
      itemId,
      status: 'completed',
      score: null,
      attempts: 1,
      data: null,
      completedAt: new Date(),
    }))
  )

describe('join', () => {
  const cohort = {
    id: 'k1',
    startsAt: PAST,
    endsAt: FUTURE,
    institution: { id: 'h1', name: 'Harbor Point' },
    course: { id: 'c1' },
  }

  it('rejects an unknown code and an ended cohort', async () => {
    prisma.cohort.findFirst.mockResolvedValue(null)
    await expect(service.join('u1', 'NOPE')).rejects.toThrow(NotFoundException)
    prisma.cohort.findFirst.mockResolvedValue({ ...cohort, endsAt: PAST })
    await expect(service.join('u1', 'ABCD2345')).rejects.toThrow(ConflictException)
  })

  it('matches the code case-insensitively and mirrors the user once', async () => {
    prisma.cohort.findFirst.mockResolvedValue(cohort)
    prisma.user.findUnique.mockResolvedValue(null)
    clerk.getUserProfile.mockResolvedValue({ email: 'a@b.co', displayName: 'Ann' })
    prisma.enrollment.findUnique.mockResolvedValue(null)
    prisma.enrollment.findMany.mockResolvedValue([])
    await service.join('u1', ' abcd2345 ').catch(() => undefined)
    expect(prisma.cohort.findFirst.mock.calls[0][0].where.joinKey).toEqual({
      equals: 'abcd2345',
      mode: 'insensitive',
    })
    expect(clerk.getUserProfile).toHaveBeenCalledWith('u1', 'learn')
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { id: 'u1', source: 'learn', email: 'a@b.co', displayName: 'Ann' },
    })
    expect(prisma.enrollment.create).toHaveBeenCalledWith({
      data: { cohortId: 'k1', userId: 'u1' },
    })
    expect(prisma.membership.upsert).toHaveBeenCalled()
  })

  it('refuses a new learner when the cohort is full, but not someone already in it', async () => {
    prisma.cohort.findFirst.mockResolvedValue({ ...cohort, maxLearners: 2 })
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' })
    prisma.enrollment.findMany.mockResolvedValue([])
    prisma.enrollment.count.mockResolvedValue(2)
    prisma.enrollment.findUnique.mockResolvedValue(null)
    await expect(service.join('u1', 'ABCD2345')).rejects.toThrow(/full/)
    expect(prisma.enrollment.create).not.toHaveBeenCalled()
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', status: 'enrolled' })
    await service.join('u1', 'ABCD2345').catch(() => undefined)
    expect(prisma.enrollment.create).not.toHaveBeenCalled()
  })

  it('does not enroll twice', async () => {
    prisma.cohort.findFirst.mockResolvedValue(cohort)
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' })
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', status: 'enrolled' })
    prisma.enrollment.findMany.mockResolvedValue([])
    await service.join('u1', 'ABCD2345').catch(() => undefined)
    expect(prisma.enrollment.create).not.toHaveBeenCalled()
  })
})

describe('join with approval (#68)', () => {
  const cohort = {
    id: 'k1',
    name: 'Fall',
    startsAt: PAST,
    endsAt: FUTURE,
    requiresApproval: true,
    joinContact: 'Dana Reyes, dana@example.org',
    institution: { id: 'h1', name: 'Harbor Point' },
    course: { id: 'c1', title: 'MA' },
  }
  const stored = (over: object = {}) => ({
    id: 'r1',
    cohortId: 'k1',
    userId: 'u1',
    status: 'pending',
    createdAt: new Date('2026-10-07T12:00:00Z'),
    ...over,
  })
  beforeEach(() => {
    prisma.cohort.findFirst.mockResolvedValue(cohort)
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' })
    prisma.enrollment.findUnique.mockResolvedValue(null)
    prisma.joinRequest.findUnique.mockResolvedValue(null)
    prisma.joinRequest.upsert.mockResolvedValue(stored())
  })

  it('with approval off (or unset) never touches join requests and enrolls as before', async () => {
    for (const requiresApproval of [false, undefined]) {
      jest.clearAllMocks()
      prisma.cohort.findFirst.mockResolvedValue({ ...cohort, requiresApproval })
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' })
      prisma.enrollment.findUnique.mockResolvedValue(null)
      prisma.enrollment.findMany.mockResolvedValue([])
      const out = await service.join('u1', 'ABCD2345').catch(() => undefined)
      expect(out && 'pending' in out).toBeFalsy()
      expect(prisma.enrollment.create).toHaveBeenCalledWith({
        data: { cohortId: 'k1', userId: 'u1' },
      })
      expect(prisma.membership.upsert).toHaveBeenCalled()
      expect(prisma.joinRequest.findUnique).not.toHaveBeenCalled()
      expect(prisma.joinRequest.upsert).not.toHaveBeenCalled()
    }
  })

  it('creates a pending request, no enrollment and no membership, and returns it', async () => {
    const out = await service.join('u1', 'ABCD2345')
    expect(out).toEqual({
      pending: true,
      request: {
        id: 'r1',
        cohortId: 'k1',
        cohortName: 'Fall',
        courseTitle: 'MA',
        institutionName: 'Harbor Point',
        status: 'pending',
        requestedAt: '2026-10-07T12:00:00.000Z',
        contact: 'Dana Reyes, dana@example.org',
      },
    })
    expect(prisma.joinRequest.upsert.mock.calls[0][0].create).toEqual({
      cohortId: 'k1',
      userId: 'u1',
    })
    expect(prisma.enrollment.create).not.toHaveBeenCalled()
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
    expect(prisma.membership.upsert).not.toHaveBeenCalled()
  })

  it('keeps the place in line when the request is already pending', async () => {
    prisma.joinRequest.findUnique.mockResolvedValue(stored())
    const out = await service.join('u1', 'ABCD2345')
    expect(out).toMatchObject({ pending: true, request: { id: 'r1' } })
    expect(prisma.joinRequest.upsert).not.toHaveBeenCalled()
  })

  it('reopens a declined request', async () => {
    prisma.joinRequest.findUnique.mockResolvedValue(stored({ status: 'declined' }))
    await service.join('u1', 'ABCD2345')
    const update = prisma.joinRequest.upsert.mock.calls[0][0].update
    expect(update).toMatchObject({ status: 'pending', decidedAt: null, decidedBy: null })
    expect(update.createdAt).toBeInstanceOf(Date)
  })

  it('does not block a request when the cohort is full', async () => {
    prisma.cohort.findFirst.mockResolvedValue({ ...cohort, maxLearners: 1 })
    prisma.enrollment.count.mockResolvedValue(1)
    expect(await service.join('u1', 'ABCD2345')).toMatchObject({ pending: true })
  })

  it('still refuses an ended cohort', async () => {
    prisma.cohort.findFirst.mockResolvedValue({ ...cohort, endsAt: PAST })
    await expect(service.join('u1', 'ABCD2345')).rejects.toThrow(ConflictException)
    expect(prisma.joinRequest.upsert).not.toHaveBeenCalled()
  })

  it('treats someone already in the cohort as before: no request', async () => {
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', status: 'enrolled' })
    prisma.enrollment.findMany.mockResolvedValue([])
    await service.join('u1', 'ABCD2345').catch(() => undefined)
    expect(prisma.joinRequest.upsert).not.toHaveBeenCalled()
    expect(prisma.membership.upsert).toHaveBeenCalled()
  })

  it('asks again for someone who withdrew', async () => {
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', status: 'withdrawn' })
    expect(await service.join('u1', 'ABCD2345')).toMatchObject({ pending: true })
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
  })

  it('grants a pending requester no access: the course, outline and items stay closed', async () => {
    await service.join('u1', 'ABCD2345')
    prisma.enrollment.findUnique.mockResolvedValue(null) // still no enrollment
    prisma.enrollment.findMany.mockResolvedValue([])
    await expect(service.outline('u1', 'k1')).rejects.toThrow(NotFoundException)
    await expect(service.item('u1', 'k1', 'i1')).rejects.toThrow(NotFoundException)
    expect(await service.cards('u1')).toEqual([])
    expect(prisma.enrollment.findMany.mock.calls.at(-1)?.[0].where).toMatchObject({
      status: { not: 'withdrawn' },
    })
  })

  it('lists only pending and declined requests, newest first, with the contact', async () => {
    prisma.joinRequest.findMany.mockResolvedValue([
      {
        ...stored({ status: 'declined' }),
        cohort: {
          name: 'Fall',
          joinContact: 'Dana',
          institution: { name: 'Harbor Point' },
          course: { title: 'MA' },
        },
      },
    ])
    const out = await service.joinRequests('u1')
    const q = prisma.joinRequest.findMany.mock.calls[0][0]
    expect(q.where).toMatchObject({ userId: 'u1', status: { in: ['pending', 'declined'] } })
    expect(q.orderBy).toEqual({ createdAt: 'desc' })
    expect(out).toEqual([
      {
        id: 'r1',
        cohortId: 'k1',
        cohortName: 'Fall',
        courseTitle: 'MA',
        institutionName: 'Harbor Point',
        status: 'declined',
        requestedAt: '2026-10-07T12:00:00.000Z',
        contact: 'Dana',
      },
    ])
  })
})

describe('item', () => {
  it('never sends the answer key', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(
      item('knowledge_check', null, { questions: quiz })
    )
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    const out = await service.item('u1', 'k1', 'i1')
    expect(out.questions).toEqual([
      { prompt: 'Pulse?', options: ['20', '70'] },
      { prompt: 'IDs?', options: ['One', 'Two'] },
    ])
    expect(JSON.stringify(out)).not.toContain('correctIndex')
  })

  it('refuses an item from another course', async () => {
    prisma.courseItem.findUnique.mockResolvedValue({
      ...item('lesson'),
      module: { courseId: 'other' },
    })
    await expect(service.item('u1', 'k1', 'i1')).rejects.toThrow(NotFoundException)
  })

  it('says a cohort that has not started is locked', async () => {
    prisma.enrollment.findUnique.mockResolvedValue(
      enrollment({ startsAt: FUTURE, endsAt: new Date('2100-01-01T00:00:00Z') })
    )
    prisma.courseItem.findUnique.mockResolvedValue(item('lesson'))
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    expect((await service.item('u1', 'k1', 'i1')).locked).toMatch(/not started/)
  })
})

describe('submitQuiz', () => {
  it('grades on the server and records the score', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(
      item('knowledge_check', null, { questions: quiz })
    )
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    const { result } = await service.submitQuiz('u1', 'k1', 'i1', [1, 0])
    expect(result.score).toBe(50)
    expect(prisma.itemProgress.upsert.mock.calls[0][0].create).toMatchObject({
      status: 'completed',
      score: 50,
    })
  })

  it('lets a knowledge check be retaken after it is completed', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(
      item('knowledge_check', null, { questions: quiz })
    )
    prisma.itemProgress.findUnique.mockResolvedValue({ status: 'completed', score: 90 })
    await expect(service.submitQuiz('u1', 'k1', 'i1', [1, 1])).resolves.toBeDefined()
  })

  it('has no questions to answer on a tool item', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(item('tool', 'pre', {}))
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    await expect(service.submitQuiz('u1', 'k1', 'i1', [1, 1])).rejects.toThrow(ConflictException)
  })

  it('treats a stored item of an unsupported type as not found', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(item('assessment', 'pre', { questions: quiz }))
    await expect(service.item('u1', 'k1', 'i1')).rejects.toThrow(NotFoundException)
    await expect(service.submitQuiz('u1', 'k1', 'i1', [1, 1])).rejects.toThrow(NotFoundException)
  })

  it('keeps the best score when a knowledge check is retaken', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(
      item('knowledge_check', null, { questions: quiz })
    )
    prisma.itemProgress.findUnique.mockResolvedValue({
      status: 'completed',
      score: 100,
      attempts: 1,
    })
    await service.submitQuiz('u1', 'k1', 'i1', [0, 0])
    expect(prisma.itemProgress.upsert.mock.calls[0][0].update.score).toBe(100)
  })

  it('refuses work once the cohort has ended', async () => {
    prisma.enrollment.findUnique.mockResolvedValue(
      enrollment({ startsAt: PAST, endsAt: new Date('2021-01-01T00:00:00Z') })
    )
    prisma.courseItem.findUnique.mockResolvedValue(
      item('knowledge_check', null, { questions: quiz })
    )
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    await expect(service.submitQuiz('u1', 'k1', 'i1', [1, 1])).rejects.toThrow(/ended/)
  })
})

describe('outline with a legacy item', () => {
  it('skips a stored item of an unsupported type instead of failing', async () => {
    prisma.courseModule.findMany.mockResolvedValue([
      {
        id: 'm1',
        title: 'M',
        position: 1,
        items: [
          { ...item('assessment', 'pre', { questions: quiz }), id: 'old' },
          { ...item('lesson'), id: 'l1' },
        ],
      },
    ])
    const out = await service.outline('u1', 'k1')
    expect(out.modules[0].items.map((i) => i.id)).toEqual(['l1'])
    expect(out.cohort.itemsTotal).toBe(1)
  })
})

describe('completion', () => {
  /** The completion check reads progress twice: what is finished, then the interview scores. */
  const check = (ids: string[], interviewScores: number[]) => {
    // Unused queued answers from an earlier step (an early exit never reads the scores) must go.
    prisma.itemProgress.findMany.mockReset()
    prisma.itemProgress.findMany
      .mockResolvedValueOnce(
        ids.map((itemId) => ({
          itemId,
          status: 'completed',
          score: null,
          attempts: 1,
          data: null,
          completedAt: new Date(),
        }))
      )
      .mockResolvedValueOnce(interviewScores.map((score) => ({ score })))
    prisma.course.findUnique.mockResolvedValue({ readinessThreshold: 70 })
  }

  it('completes a course with no interview once everything required is done', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(item('lesson'))
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    prisma.courseModule.findMany.mockResolvedValue([
      { id: 'm1', title: 'M', position: 1, items: [{ id: 'i1', type: 'lesson' }] },
    ])
    finished('i1')
    await service.completeLesson('u1', 'k1', 'i1')
    expect(prisma.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: expect.objectContaining({ status: 'completed' }),
    })
  })

  it('holds the course open until an interview reaches the readiness goal', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(item('lesson'))
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    prisma.courseModule.findMany.mockResolvedValue([
      {
        id: 'm1',
        title: 'M',
        position: 1,
        items: [
          { id: 'i1', type: 'lesson' },
          { id: 'i2', type: 'interview' },
        ],
      },
    ])
    check(['i1'], [])
    await service.completeLesson('u1', 'k1', 'i1')
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
    check(['i1', 'i2'], [46])
    await service.completeLesson('u1', 'k1', 'i1')
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
    check(['i1', 'i2'], [46, 82])
    await service.completeLesson('u1', 'k1', 'i1')
    expect(prisma.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: expect.objectContaining({ status: 'completed' }),
    })
  })

  it('requires every tool item, and readiness when one counts as an interview', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(item('lesson'))
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    prisma.courseModule.findMany.mockResolvedValue([
      {
        id: 'm1',
        title: 'M',
        position: 1,
        items: [
          { id: 'i1', type: 'lesson' },
          {
            id: 'i2',
            type: 'tool',
            label: null,
            config: { toolId: 'id-interview', countsAsInterview: true },
          },
          { id: 'i3', type: 'tool', label: null, config: { toolId: 'id-interview' } },
        ],
      },
    ])
    check(['i1'], [])
    await service.completeLesson('u1', 'k1', 'i1')
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
    check(['i1', 'i2', 'i3'], [0])
    await service.completeLesson('u1', 'k1', 'i1')
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
    check(['i1', 'i2', 'i3'], [75])
    await service.completeLesson('u1', 'k1', 'i1')
    expect(prisma.enrollment.update).toHaveBeenCalled()
  })

  describe('recomputeCompletion', () => {
    const modulesWithInterview = () =>
      prisma.courseModule.findMany.mockResolvedValue([
        {
          id: 'm1',
          title: 'M',
          position: 1,
          items: [
            { id: 'i1', type: 'lesson' },
            { id: 'i2', type: 'interview' },
          ],
        },
      ])
    const enrollment = (status: string, completedAt: Date | null) =>
      prisma.enrollment.findUnique.mockResolvedValue({
        id: 'e1',
        status,
        completedAt,
        cohort: { courseId: 'c1' },
      })
    const rows = (finishedAt: Date, scores: { score: number; completedAt: Date }[]) => {
      prisma.itemProgress.findMany.mockReset()
      prisma.itemProgress.findMany
        .mockResolvedValueOnce([{ itemId: 'i1', status: 'completed', completedAt: finishedAt }])
        .mockResolvedValueOnce(scores)
      prisma.course.findUnique.mockResolvedValue({ readinessThreshold: 70 })
    }
    const day = (d: number) => new Date(`2026-09-${String(d).padStart(2, '0')}T12:00:00Z`)

    it('reopens a learner who completed under an older rule but is not ready', async () => {
      modulesWithInterview()
      enrollment('completed', day(20))
      rows(day(10), [{ score: 46, completedAt: day(20) }])
      expect(await service.recomputeCompletion('e1')).toEqual({ change: 'reopened' })
      expect(prisma.enrollment.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { status: 'enrolled', completedAt: null },
      })
    })

    it('completes a ready learner, dated to when the last requirement was met', async () => {
      modulesWithInterview()
      enrollment('enrolled', null)
      rows(day(10), [{ score: 82, completedAt: day(15) }])
      expect(await service.recomputeCompletion('e1')).toEqual({ change: 'completed' })
      expect(prisma.enrollment.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { status: 'completed', completedAt: day(15) },
      })
    })

    it('corrects a wrong completion date and leaves a correct record alone', async () => {
      modulesWithInterview()
      enrollment('completed', day(25))
      rows(day(10), [{ score: 82, completedAt: day(15) }])
      expect(await service.recomputeCompletion('e1')).toEqual({ change: 'date' })
      expect(prisma.enrollment.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { completedAt: day(15) },
      })
      prisma.enrollment.update.mockClear()
      enrollment('completed', day(15))
      rows(day(10), [{ score: 82, completedAt: day(15) }])
      expect(await service.recomputeCompletion('e1')).toEqual({ change: null })
      expect(prisma.enrollment.update).not.toHaveBeenCalled()
    })

    it('refuses a withdrawn learner', async () => {
      enrollment('withdrawn', null)
      await expect(service.recomputeCompletion('e1')).rejects.toThrow('withdrawn')
    })
  })

  it('does not wait for a tool item marked optional', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(item('lesson'))
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    prisma.courseModule.findMany.mockResolvedValue([
      {
        id: 'm1',
        title: 'M',
        position: 1,
        items: [
          { id: 'i1', type: 'lesson' },
          { id: 'i2', type: 'tool', label: null, config: { optional: true } },
        ],
      },
    ])
    finished('i1')
    await service.completeLesson('u1', 'k1', 'i1')
    expect(prisma.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: expect.objectContaining({ status: 'completed' }),
    })
  })

  it('still requires a tool item whose tool is switched off, so a brief switch-off cannot complete a course early', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(item('lesson'))
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    prisma.courseModule.findMany.mockResolvedValue([
      {
        id: 'm1',
        title: 'M',
        position: 1,
        items: [
          { id: 'i1', type: 'lesson' },
          { id: 'i3', type: 'tool', label: null, config: { toolId: 'id-interview' } },
        ],
      },
    ])
    setStoredTools(withFirstTool({ enabled: false, workspaceIds: [] }))
    try {
      finished('i1')
      await service.completeLesson('u1', 'k1', 'i1')
      expect(prisma.enrollment.update).not.toHaveBeenCalled()
    } finally {
      resetToDefaults()
    }
  })

  it('stays enrolled while required items remain', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(item('lesson'))
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    prisma.courseModule.findMany.mockResolvedValue([
      {
        id: 'm1',
        title: 'M',
        position: 1,
        items: [
          { id: 'i1', type: 'lesson' },
          { id: 'i3', type: 'lesson' },
        ],
      },
    ])
    finished('i1')
    await service.completeLesson('u1', 'k1', 'i1')
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
  })
})

describe('buildRecord', () => {
  const items = [
    { id: 'a', type: 'tool', label: 'pre' },
    { id: 'b', type: 'tool', label: 'post' },
    { id: 'c', type: 'interview', label: null },
  ]
  const course = { targetScore: 75, readinessThreshold: 70 }

  it('derives gain, target and readiness from results', () => {
    const r = buildRecord(
      items,
      [
        { itemId: 'a', status: 'completed', score: 54 },
        { itemId: 'b', status: 'completed', score: 80 },
        { itemId: 'c', status: 'completed', score: 69 },
      ],
      course,
      true
    )
    expect(r).toMatchObject({
      pre: 54,
      post: 80,
      gain: 26,
      reachedTarget: true,
      interviewBest: 69,
      interviewReady: false,
      completed: true,
    })
  })

  it('counts a connected interview tool toward interview readiness only when flagged', () => {
    const r = buildRecord(
      [{ id: 't', type: 'tool', label: null, config: { countsAsInterview: true } }],
      [{ itemId: 't', status: 'completed', score: 88 }],
      course,
      false
    )
    expect(r).toMatchObject({ interviewBest: 88, interviewReady: true })
  })

  it('keeps an unflagged tool item out of interview readiness', () => {
    const r = buildRecord(
      [
        { id: 'd', type: 'tool', label: null, config: {} },
        { id: 's', type: 'tool', label: null, config: {} },
        {
          id: 'v',
          type: 'tool',
          label: null,
          config: { countsAsInterview: true },
        },
        { id: 'n', type: 'tool', label: null, config: {} },
        { id: 'p', type: 'tool', label: 'pre', config: {} },
        { id: 'i', type: 'interview', label: null },
      ],
      [
        { itemId: 'd', status: 'completed', score: 95 },
        { itemId: 's', status: 'completed', score: 60 },
        { itemId: 'v', status: 'completed', score: 72 },
        { itemId: 'n', status: 'in_progress', score: null },
        { itemId: 'p', status: 'completed', score: 40 },
      ],
      course,
      false
    )
    expect(r.interviewBest).toBe(72)
    expect(r.interviewReady).toBe(true)
    expect(r).not.toHaveProperty('practice')
  })

  it('shows a high unflagged simulation as no interview score at all', () => {
    const r = buildRecord(
      [{ id: 'd', type: 'tool', label: null }],
      [{ itemId: 'd', status: 'completed', score: 99 }],
      course,
      false
    )
    expect(r).toMatchObject({ interviewBest: null, interviewReady: false })
  })

  it('feeds a labelled tool item into pre, post and gain, not interview readiness', () => {
    const r = buildRecord(
      [
        { id: 'p', type: 'tool', label: 'pre' },
        { id: 'q', type: 'tool', label: 'post' },
        { id: 'c', type: 'interview', label: null },
      ],
      [
        { itemId: 'p', status: 'completed', score: 40 },
        { itemId: 'q', status: 'completed', score: 90 },
        { itemId: 'c', status: 'completed', score: 50 },
      ],
      course,
      false
    )
    expect(r).toMatchObject({
      pre: 40,
      post: 90,
      gain: 50,
      reachedTarget: true,
      interviewBest: 50,
      interviewReady: false,
    })
  })

  it('has no interview score when only labelled tool items are done', () => {
    const r = buildRecord(
      [{ id: 'p', type: 'tool', label: 'pre' }],
      [{ itemId: 'p', status: 'completed', score: 95 }],
      course,
      false
    )
    expect(r).toMatchObject({ pre: 95, interviewBest: null, interviewReady: false })
  })

  it('shows nothing earned before anything is done', () => {
    expect(buildRecord(items, [], course, false)).toMatchObject({
      pre: null,
      post: null,
      gain: null,
      reachedTarget: false,
      interviewReady: false,
    })
  })
})

describe('scorm', () => {
  it('builds a same-origin, encoded launch URL', () => {
    expect(scormSrc('abc', 'story/my page.html?mode=1')).toBe(
      '/scorm/abc/story/my%20page.html?mode=1'
    )
  })

  it('reads done and a 0-100 score from what the package reported', () => {
    expect(scormResult({ completionStatus: 'completed', score: { raw: 8, max: 10 } })).toEqual({
      done: true,
      score: 80,
    })
    expect(scormResult({ successStatus: 'passed', score: { raw: 90 } })).toEqual({
      done: true,
      score: 90,
    })
    expect(scormResult({ completionStatus: 'incomplete', score: { scaled: 0.5 } })).toEqual({
      done: false,
      score: 50,
    })
    expect(scormResult({ completionStatus: 'incomplete', successStatus: 'failed' })).toEqual({
      done: false,
      score: null,
    })
    expect(scormResult({ score: { raw: 250 } }).score).toBe(100)
    expect(scormResult(null)).toEqual({ done: false, score: null })
  })

  it('keeps the best score and never un-completes an item', async () => {
    prisma.courseItem.findUnique.mockResolvedValue({
      ...item('scorm'),
      config: { packageId: 'p', entry: 'index.html', version: '1.2' },
    })
    prisma.itemProgress.findUnique.mockResolvedValue({ status: 'completed', score: 90 })
    await service.saveScorm('u1', 'k1', 'i1', {
      completionStatus: 'incomplete',
      score: { raw: 40 },
    })
    const update = prisma.itemProgress.upsert.mock.calls[0][0].update
    expect(update.status).toBe('completed')
    expect(update.score).toBe(90)
  })

  it('rejects a SCORM result for an item that is not SCORM', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(item('lesson'))
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    await expect(service.saveScorm('u1', 'k1', 'i1', {})).rejects.toThrow(ConflictException)
  })
})

describe('video', () => {
  const video = { ...item('video'), config: { provider: 'youtube', videoId: 'dQw4w9WgXcQ' } }

  it('is shown to the learner with the share they must watch, and a bad stored ID is not', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(video)
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    expect((await service.item('u1', 'k1', 'i1')).video).toEqual({
      videoId: 'dQw4w9WgXcQ',
      startSeconds: null,
      minWatchedPct: 90,
    })
    prisma.courseItem.findUnique.mockResolvedValue({
      ...video,
      config: { videoId: '"><script>' },
    })
    expect((await service.item('u1', 'k1', 'i1')).video).toBeNull()
  })

  it('needs the player to show 90% before it counts, but accepts a hand-marked fallback', () => {
    expect(videoEvidence({ completedBy: 'player', watchedPct: 90 })).toEqual({
      evidence: 'player-verified',
      watchedPct: 90,
    })
    expect(() => videoEvidence({ completedBy: 'player', watchedPct: 89 })).toThrow(
      BadRequestException
    )
    expect(() => videoEvidence({ completedBy: 'player' })).toThrow(BadRequestException)
    expect(() => videoEvidence({ completedBy: 'bot', watchedPct: 100 })).toThrow(
      BadRequestException
    )
    expect(videoEvidence({ completedBy: 'manual' })).toEqual({
      evidence: 'self-attested',
      watchedPct: 0,
    })
    expect(videoEvidence({ completedBy: 'player', watchedPct: 400 }).watchedPct).toBe(100)
  })

  it('stores how it was completed and counts toward finishing the course', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(video)
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    prisma.courseModule.findMany.mockResolvedValue([
      { id: 'm1', title: 'M', position: 1, items: [{ id: 'i1', type: 'video' }] },
    ])
    finished('i1')
    await service.completeVideo('u1', 'k1', 'i1', { completedBy: 'player', watchedPct: 96 })
    expect(prisma.itemProgress.upsert.mock.calls[0][0].create).toMatchObject({
      status: 'completed',
      data: expect.objectContaining({ evidence: 'player-verified', watchedPct: 96 }),
    })
    expect(prisma.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: expect.objectContaining({ status: 'completed' }),
    })
  })

  it('does not overwrite evidence once the video is done', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(video)
    prisma.itemProgress.findUnique.mockResolvedValue({ status: 'completed', score: null })
    await service.completeVideo('u1', 'k1', 'i1', { completedBy: 'manual' })
    expect(prisma.itemProgress.upsert).not.toHaveBeenCalled()
  })

  it('refuses an item that is not a video, and a cohort that is not open', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(item('lesson'))
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    await expect(
      service.completeVideo('u1', 'k1', 'i1', { completedBy: 'manual' })
    ).rejects.toThrow(ConflictException)
    prisma.courseItem.findUnique.mockResolvedValue(video)
    prisma.enrollment.findUnique.mockResolvedValue(enrollment({ endsAt: PAST }))
    await expect(
      service.completeVideo('u1', 'k1', 'i1', { completedBy: 'manual' })
    ).rejects.toThrow(ConflictException)
  })
})

describe('external link', () => {
  const link = {
    ...item('external_link'),
    config: {
      url: 'https://www.udemy.com/course/safe-lifting/',
      summary: 'Lifting basics',
      instructions: 'Finish section 2',
      imageKey: 'learn-images/0b9d1c64-3f0e-4d58-9c11-6a1f2f6a9d10.png',
    },
  }

  it('is shown with its host and instructions, and a link off the allowlist is not', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(link)
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    expect((await service.item('u1', 'k1', 'i1')).link).toEqual({
      url: 'https://www.udemy.com/course/safe-lifting/',
      host: 'www.udemy.com',
      summary: 'Lifting basics',
      instructions: 'Finish section 2',
      imageUrl: expect.stringContaining('learn-images/0b9d1c64-3f0e-4d58-9c11-6a1f2f6a9d10.png'),
    })
    prisma.courseItem.findUnique.mockResolvedValue({
      ...link,
      config: { url: 'javascript:alert(1)' },
    })
    expect((await service.item('u1', 'k1', 'i1')).link).toBeNull()
  })

  it("is marked done on the learner's word and kept as self-attested", async () => {
    prisma.courseItem.findUnique.mockResolvedValue(link)
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    prisma.courseModule.findMany.mockResolvedValue([
      { id: 'm1', title: 'M', position: 1, items: [{ id: 'i1', type: 'external_link' }] },
    ])
    finished('i1')
    await service.completeExternal('u1', 'k1', 'i1')
    expect(prisma.itemProgress.upsert.mock.calls[0][0].create).toMatchObject({
      status: 'completed',
      data: expect.objectContaining({ evidence: 'self-attested' }),
    })
    expect(prisma.enrollment.update).toHaveBeenCalled()
  })

  it('refuses another item type and does not overwrite a finished item', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(item('lesson'))
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    await expect(service.completeExternal('u1', 'k1', 'i1')).rejects.toThrow(ConflictException)
    prisma.courseItem.findUnique.mockResolvedValue(link)
    prisma.itemProgress.findUnique.mockResolvedValue({ status: 'completed', score: null })
    await service.completeExternal('u1', 'k1', 'i1')
    expect(prisma.itemProgress.upsert).not.toHaveBeenCalled()
  })
})

describe('adaptive plan', () => {
  const skills = [{ id: 'safety', label: 'Workplace safety', targetPct: 70 }]
  const tagged = [
    { id: 'q_00000001', prompt: 'a', options: ['x', 'y'], correctIndex: 0, skill: 'safety' },
    { id: 'q_00000002', prompt: 'b', options: ['x', 'y'], correctIndex: 0, skill: 'safety' },
  ]
  const check = { ...item('knowledge_check', null, { questions: tagged }), id: 'k1' }
  const lesson = {
    ...item('lesson', null, { body: 'Lift safely', remediationFor: 'safety' }),
    id: 'r1',
    title: 'Safe lifting',
  }
  const video = {
    ...item('video', null, { videoId: 'dQw4w9WgXcQ', remediationFor: 'safety' }),
    id: 'r2',
    title: 'Lifting video',
  }
  const withSkills = () =>
    prisma.enrollment.findUnique.mockResolvedValue({
      ...enrollment(),
      cohort: {
        ...enrollment().cohort,
        course: { ...enrollment().cohort.course, skills },
      },
    })
  const outlineOf = (...items: object[]) =>
    prisma.courseModule.findMany.mockResolvedValue([{ id: 'm1', title: 'M', position: 1, items }])
  /** What the plan code sees after the learner's attempt is saved. */
  const afterAttempt = (...correct: boolean[]) =>
    prisma.itemProgress.findMany.mockResolvedValue([
      {
        itemId: 'k1',
        status: 'completed',
        score: 50,
        data: { results: tagged.map((q, i) => ({ id: q.id, correct: correct[i] })) },
      },
    ])

  it('stores which questions were right, so a weak skill can be found later', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(check)
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    await service.submitQuiz('u1', 'k1', 'k1', [0, 1])
    expect(prisma.itemProgress.upsert.mock.calls[0][0].create.data).toEqual({
      results: [
        { id: 'q_00000001', correct: true },
        { id: 'q_00000002', correct: false },
      ],
    })
  })

  it("adds the author's remediation items for a flagged skill and tells the learner why", async () => {
    withSkills()
    prisma.courseItem.findUnique.mockResolvedValue(check)
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    outlineOf(check, lesson, video)
    afterAttempt(true, false) // 50% against a 70% pass mark
    const { item: shown } = await service.submitQuiz('u1', 'k1', 'k1', [0, 1])
    expect(prisma.planItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          enrollmentId: 'e1',
          itemId: 'r1',
          reason: {
            skill: 'safety',
            skillLabel: 'Workplace safety',
            pct: 50,
            n: 2,
            sourceItemId: 'k1',
          },
        }),
        expect.objectContaining({ itemId: 'r2' }),
      ],
      skipDuplicates: true,
    })
    expect(shown.planAdded).toEqual([
      expect.objectContaining({
        itemId: 'r1',
        title: 'Safe lifting',
        skill: 'Workplace safety',
        pct: 50,
      }),
      expect.objectContaining({ itemId: 'r2' }),
    ])
  })

  it('adds nothing when the skill is met, or when the course has no skills', async () => {
    withSkills()
    prisma.courseItem.findUnique.mockResolvedValue(check)
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    outlineOf(check, lesson)
    afterAttempt(true, true)
    await service.submitQuiz('u1', 'k1', 'k1', [0, 0])
    expect(prisma.planItem.createMany).not.toHaveBeenCalled()
    prisma.enrollment.findUnique.mockResolvedValue(enrollment())
    afterAttempt(false, false)
    await service.submitQuiz('u1', 'k1', 'k1', [1, 1])
    expect(prisma.planItem.createMany).not.toHaveBeenCalled()
  })

  it('does not add an item that is already in the plan', async () => {
    withSkills()
    prisma.courseItem.findUnique.mockResolvedValue(check)
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    outlineOf(check, lesson, video)
    afterAttempt(false, false)
    prisma.planItem.findMany.mockResolvedValue([{ itemId: 'r1' }])
    await service.submitQuiz('u1', 'k1', 'k1', [1, 1])
    expect(prisma.planItem.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ itemId: 'r2' }),
    ])
  })

  it('holds the course open until the added items are done', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(check)
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    outlineOf(check, lesson)
    prisma.planItem.findMany.mockResolvedValue([
      { itemId: 'r1', createdAt: new Date('2020-01-01') },
    ])
    finished('k1') // the check is done, the lesson is not
    await service.submitQuiz('u1', 'k1', 'k1', [0, 0])
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
    expect(prisma.itemProgress.findMany.mock.calls[0][0].where.itemId.in).toEqual(['k1', 'r1'])
    finished('k1', 'r1')
    await service.submitQuiz('u1', 'k1', 'k1', [0, 0])
    expect(prisma.enrollment.update).toHaveBeenCalled()
  })

  it('does not require remediation items from a learner who was not flagged', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(check)
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    outlineOf(check, lesson)
    finished('k1')
    await service.submitQuiz('u1', 'k1', 'k1', [0, 0])
    expect(prisma.itemProgress.findMany.mock.calls[0][0].where.itemId.in).toEqual(['k1'])
    expect(prisma.enrollment.update).toHaveBeenCalled()
  })

  it('keeps remediation items out of the outline until they are added, then lists them with the reason', async () => {
    outlineOf(check, lesson)
    const before = await service.outline('u1', 'k1')
    expect(before.modules[0].items.map((i) => i.id)).toEqual(['k1'])
    expect(before.added).toEqual([])
    expect(before.cohort.itemsTotal).toBe(1)
    prisma.planItem.findMany.mockResolvedValue([
      {
        itemId: 'r1',
        createdAt: new Date('2020-01-01'),
        reason: { skillLabel: 'Workplace safety', pct: 50, n: 2, sourceItemId: 'k1' },
      },
    ])
    finished('r1')
    const after = await service.outline('u1', 'k1')
    expect(after.added).toEqual([
      expect.objectContaining({
        id: 'r1',
        title: 'Safe lifting',
        status: 'completed',
        reason: { skill: 'Workplace safety', pct: 50, n: 2, sourceItemId: 'k1' },
        review: false,
      }),
    ])
    expect(after.cohort).toMatchObject({ itemsDone: 1, itemsTotal: 2 })
  })

  describe('review of existing course content', () => {
    // A lesson in the normal outline that is sent back to a learner flagged on the skill.
    const review = {
      ...item('lesson', null, { body: 'Taking vitals', reviewFor: 'safety' }),
      id: 'v1',
      title: 'Taking vital signs',
    }
    const BEFORE = new Date('2026-01-01T00:00:00Z')
    const AFTER = new Date('2026-02-01T00:00:00Z')
    const planned = {
      itemId: 'v1',
      createdAt: AFTER,
      reason: { skillLabel: 'Workplace safety', pct: 50 },
    }

    it("adds it back to a flagged learner's plan, marked as a review, while it stays in the outline", async () => {
      withSkills()
      prisma.courseItem.findUnique.mockResolvedValue(check)
      prisma.itemProgress.findUnique.mockResolvedValue(null)
      outlineOf(check, review)
      afterAttempt(true, false)
      const { item: shown } = await service.submitQuiz('u1', 'k1', 'k1', [0, 1])
      expect(prisma.planItem.createMany.mock.calls[0][0].data).toEqual([
        expect.objectContaining({ itemId: 'v1' }),
      ])
      expect(shown.planAdded).toEqual([expect.objectContaining({ itemId: 'v1', review: true })])
      const outline = await service.outline('u1', 'k1')
      expect(outline.modules[0].items.map((i) => i.id)).toEqual(['k1', 'v1'])
    })

    it('is not done for the plan just because it was done before', async () => {
      outlineOf(check, review)
      prisma.planItem.findMany.mockResolvedValue([planned])
      prisma.itemProgress.findMany.mockResolvedValue([
        { itemId: 'v1', status: 'completed', score: null, attempts: 1, completedAt: BEFORE },
      ])
      const outline = await service.outline('u1', 'k1')
      expect(outline.modules[0].items.find((i) => i.id === 'v1')?.status).toBe('completed')
      expect(outline.added).toEqual([
        expect.objectContaining({ id: 'v1', status: 'not_started', review: true }),
      ])
      expect(outline.cohort.itemsDone).toBe(1) // the outline copy, not the plan's
      expect(outline.cohort.itemsTotal).toBe(3)
    })

    it('asks the learner to complete it again, and counts that completion', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(review)
      prisma.planItem.findUnique.mockResolvedValue(planned)
      prisma.itemProgress.findUnique.mockResolvedValue({
        status: 'completed',
        score: null,
        attempts: 1,
        completedAt: BEFORE,
      })
      const shown = await service.item('u1', 'k1', 'v1')
      expect(shown).toMatchObject({
        status: 'not_started',
        review: { skill: 'Workplace safety', pct: 50 },
      })
      await service.completeLesson('u1', 'k1', 'v1')
      expect(prisma.itemProgress.upsert).toHaveBeenCalledTimes(1)
    })

    it('does not ask again once it has been redone since it was added', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(review)
      prisma.planItem.findUnique.mockResolvedValue(planned)
      prisma.itemProgress.findUnique.mockResolvedValue({
        status: 'completed',
        score: null,
        attempts: 2,
        completedAt: new Date('2026-03-01T00:00:00Z'),
      })
      expect((await service.item('u1', 'k1', 'v1')).review).toBeNull()
      await service.completeLesson('u1', 'k1', 'v1')
      expect(prisma.itemProgress.upsert).not.toHaveBeenCalled()
    })

    it('holds the course open until the review is redone, even though the item was done before', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(check)
      prisma.itemProgress.findUnique.mockResolvedValue(null)
      outlineOf(check, review)
      prisma.planItem.findMany.mockResolvedValue([planned])
      prisma.itemProgress.findMany.mockResolvedValue([
        { itemId: 'k1', status: 'completed', completedAt: BEFORE },
        { itemId: 'v1', status: 'completed', completedAt: BEFORE },
      ])
      await service.submitQuiz('u1', 'k1', 'k1', [0, 0])
      expect(prisma.enrollment.update).not.toHaveBeenCalled()
      prisma.itemProgress.findMany.mockResolvedValue([
        { itemId: 'k1', status: 'completed', completedAt: BEFORE },
        { itemId: 'v1', status: 'completed', completedAt: new Date('2026-03-01T00:00:00Z') },
      ])
      await service.submitQuiz('u1', 'k1', 'k1', [0, 0])
      expect(prisma.enrollment.update).toHaveBeenCalled()
    })
  })

  it('flags a skill from a low practice-interview score and adds its remediation content', async () => {
    const interview = {
      ...item('interview', null, {
        role: 'MA',
        questions: ['Q1'],
        maxAttempts: 3,
        skill: 'safety',
      }),
      id: 'i1',
    }
    withSkills()
    prisma.courseItem.findUnique.mockResolvedValue(interview)
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    scoring.score.mockResolvedValue([{ score: 40, feedback: 'Add detail.' }])
    outlineOf(interview, lesson)
    prisma.itemProgress.findMany.mockResolvedValue([
      { itemId: 'i1', status: 'completed', score: 40, data: null },
    ])
    const shown = await service.submitInterview('u1', 'k1', 'i1', ['my answer'])
    expect(prisma.planItem.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        itemId: 'r1',
        reason: expect.objectContaining({ skill: 'safety', pct: 40, n: 1 }),
      }),
    ])
    expect(shown.planAdded).toEqual([expect.objectContaining({ itemId: 'r1', pct: 40 })])
  })

  it('opens a remediation item only for a learner whose plan includes it', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(lesson)
    await expect(service.item('u1', 'k1', 'r1')).rejects.toThrow(NotFoundException)
    prisma.planItem.findUnique.mockResolvedValue({ id: 'p1' })
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    await expect(service.item('u1', 'k1', 'r1')).resolves.toMatchObject({ id: 'r1' })
  })
})

describe('interview attempts setting', () => {
  it('uses the author setting from 1 to 5 and falls back to 1', () => {
    expect(attemptsAllowed({ maxAttempts: 2 })).toBe(2)
    expect(attemptsAllowed({ maxAttempts: 5 })).toBe(5)
    for (const bad of [0, 6, 2.5, '3', undefined])
      expect(attemptsAllowed({ maxAttempts: bad })).toBe(1)
    expect(attemptsAllowed({})).toBe(1)
  })

  it("stops a learner at the author's limit", async () => {
    prisma.courseItem.findUnique.mockResolvedValue({
      ...item('interview'),
      config: { role: 'MA', questions: ['Q1'], maxAttempts: 1 },
    })
    prisma.itemProgress.findUnique.mockResolvedValue({
      status: 'completed',
      score: 80,
      attempts: 1,
      data: { attempts: [] },
    })
    await expect(service.submitInterview('u1', 'k1', 'i1', ['a'])).rejects.toThrow(/1 attempts/)
  })
})

describe('practice interview', () => {
  const interviewItem = (
    config: object = { role: 'Medical Assistant', questions: ['Q1', 'Q2'], maxAttempts: 3 }
  ) => ({
    ...item('interview'),
    config,
  })
  const scored = [
    { score: 80, feedback: 'Good example.' },
    { score: 60, feedback: 'Add detail.' },
  ]

  it('scores the answers, records the average as the best, and keeps feedback not answers', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(interviewItem())
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    scoring.score.mockResolvedValue(scored)
    await service.submitInterview('u1', 'k1', 'i1', ['  my first answer ', 'second'])
    expect(scoring.score).toHaveBeenCalledWith(
      'Medical Assistant',
      ['Q1', 'Q2'],
      ['my first answer', 'second']
    )
    const create = prisma.itemProgress.upsert.mock.calls[0][0].create
    expect(create).toMatchObject({ status: 'completed', score: 70, attempts: 1 })
    expect(JSON.stringify(create.data)).not.toContain('my first answer')
    expect(create.data.attempts[0].answers).toEqual(scored)
  })

  it('keeps the best score across attempts and stops after three', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(interviewItem())
    prisma.itemProgress.findUnique.mockResolvedValue({
      status: 'completed',
      score: 90,
      attempts: 1,
      data: { attempts: [{ score: 90, at: 'x', answers: [] }] },
    })
    scoring.score.mockResolvedValue(scored)
    await service.submitInterview('u1', 'k1', 'i1', ['a', 'b'])
    expect(prisma.itemProgress.upsert.mock.calls[0][0].update.score).toBe(90)
    prisma.itemProgress.upsert.mockClear()
    prisma.itemProgress.findUnique.mockResolvedValue({
      status: 'completed',
      score: 90,
      attempts: 3,
      data: { attempts: [] },
    })
    await expect(service.submitInterview('u1', 'k1', 'i1', ['a', 'b'])).rejects.toThrow(
      /3 attempts/
    )
    expect(prisma.itemProgress.upsert).not.toHaveBeenCalled()
  })

  it('uses no attempt when scoring fails', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(interviewItem())
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    scoring.score.mockRejectedValue(new Error('model down'))
    await expect(service.submitInterview('u1', 'k1', 'i1', ['a', 'b'])).rejects.toThrow(
      'model down'
    )
    expect(prisma.itemProgress.upsert).not.toHaveBeenCalled()
  })

  it('needs every question answered, within the length limit', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(interviewItem())
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    await expect(service.submitInterview('u1', 'k1', 'i1', ['only one'])).rejects.toThrow(
      /Answer every/
    )
    await expect(service.submitInterview('u1', 'k1', 'i1', ['a', '   '])).rejects.toThrow(
      /Answer every/
    )
    await expect(
      service.submitInterview('u1', 'k1', 'i1', ['a', 'x'.repeat(2001)])
    ).rejects.toThrow(/under/)
    expect(scoring.score).not.toHaveBeenCalled()
  })

  it('exposes the questions and earlier feedback to the learner', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(interviewItem())
    prisma.itemProgress.findUnique.mockResolvedValue({
      status: 'completed',
      score: 70,
      attempts: 1,
      data: { attempts: [{ score: 70, at: 't', answers: scored }] },
    })
    const out = await service.item('u1', 'k1', 'i1')
    expect(out.interview).toMatchObject({
      role: 'Medical Assistant',
      questions: ['Q1', 'Q2'],
      maxAttempts: 3,
    })
    expect(out.interview?.attempts[0].answers).toEqual(scored)
  })
})

describe('recordToolResult', () => {
  const tool = item('tool', null, { toolId: 'id-interview', ref: 'cna-interview' })

  // The statement's arguments: id, enrollment, item, score, data (json), reportedAt, attempt cap.
  const statement = () => {
    const [sql, , enrollmentId, itemId, score, json, reportedAt, cap] =
      prisma.$queryRawUnsafe.mock.calls[0]
    return { sql, enrollmentId, itemId, score, data: JSON.parse(json), reportedAt, cap }
  }

  beforeEach(() => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ attempts: 1 }])
  })

  it('records the score in one statement (best, attempt count and data are decided in SQL), then checks the plan and course completion', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(tool)
    prisma.itemProgress.findUnique.mockResolvedValue({ status: 'completed', score: 90 })
    const out = await service.recordToolResult('u1', 'k1', 'i1', {
      scorePct: 72.4,
      dimensions: { Clarity: 70 },
      reportedAt: '2026-10-06T12:00:00Z',
    })
    expect(prisma.itemProgress.upsert).not.toHaveBeenCalled() // no read-modify-write
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1)
    const st = statement()
    expect(st).toMatchObject({
      enrollmentId: 'e1',
      itemId: 'i1',
      score: 72,
      reportedAt: '2026-10-06T12:00:00.000Z',
      cap: null,
    })
    expect(st.data).toMatchObject({
      lastScore: 72,
      reportedAt: '2026-10-06T12:00:00.000Z',
      dimensions: { Clarity: 70 },
    })
    expect(st.sql).toContain('GREATEST(')
    expect(st.sql).toContain('ON CONFLICT')
    expect(out.tool).toEqual({
      toolId: 'id-interview',
      name: 'Interview Differently',
      ref: 'cna-interview',
      retries: true,
      reviewable: false,
      attemptsAllowed: null,
      timeLimitMinutes: null,
      passScore: null,
      optional: false,
    })
    expect(prisma.courseModule.findMany).toHaveBeenCalled() // plan and completion checks ran
  })

  describe('attempt log (#67)', () => {
    const at = (m: number) => new Date(Date.UTC(2026, 9, 7, 10, m))

    it('passes a new attempt row id as the last statement argument', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(tool)
      prisma.itemProgress.findUnique.mockResolvedValue(null)
      await service.recordToolResult('u1', 'k1', 'i1', { scorePct: 80 })
      const args = prisma.$queryRawUnsafe.mock.calls[0]
      expect(args).toHaveLength(10) // sql + $1..$9
      expect(args[9]).toEqual(expect.any(String))
      expect(args[9]).not.toBe(args[1])
    })

    it('returns the log newest first, marking the earliest of the best scores and the pass mark', async () => {
      const graded = item('tool', 'Required', { toolId: 'id-interview', ref: 'r', passScore: 60 })
      prisma.courseItem.findUnique.mockResolvedValue(graded)
      prisma.itemProgress.findUnique.mockResolvedValue({
        status: 'completed',
        score: 80,
        attempts: 5,
      })
      prisma.itemAttempt.findMany.mockResolvedValue([
        { score: 40, createdAt: at(30) },
        { score: 80, createdAt: at(20) },
        { score: 80, createdAt: at(10) },
      ])
      const out = await service.item('u1', 'k1', 'i1')
      expect(prisma.itemAttempt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { enrollmentId: 'e1', itemId: 'i1' }, take: 50 })
      )
      expect(out.attemptLog).toEqual([
        { score: 40, at: at(30).toISOString(), best: false, passed: false },
        { score: 80, at: at(20).toISOString(), best: false, passed: true },
        { score: 80, at: at(10).toISOString(), best: true, passed: true },
      ])
      expect(out.attemptsBeforeLog).toBe(2)
    })

    it('has passed null without a pass mark, and no negative earlier-attempt count', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(tool)
      prisma.itemProgress.findUnique.mockResolvedValue({
        status: 'completed',
        score: 70,
        attempts: 1,
      })
      prisma.itemAttempt.findMany.mockResolvedValue([{ score: 70, createdAt: at(1) }])
      const out = await service.item('u1', 'k1', 'i1')
      expect(out.attemptLog).toEqual([
        { score: 70, at: at(1).toISOString(), best: true, passed: null },
      ])
      expect(out.attemptsBeforeLog).toBe(0)
    })

    it('counts the table, not the page, when the log is full (60 runs are all recorded)', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(item('tool'))
      prisma.itemProgress.findUnique.mockResolvedValue({
        status: 'completed',
        score: 70,
        attempts: 60,
      })
      prisma.itemAttempt.findMany.mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => ({ score: 70, createdAt: at(i + 1) }))
      )
      prisma.itemAttempt.count.mockResolvedValue(60)
      const out = await service.item('u1', 'k1', 'i1')
      expect(out.attemptLog).toHaveLength(50)
      expect(out.attemptsBeforeLog).toBe(0)
    })

    it('puts no best chip on the log when the best score predates it', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(item('tool'))
      prisma.itemProgress.findUnique.mockResolvedValue({
        status: 'completed',
        score: 46,
        attempts: 3,
      })
      prisma.itemAttempt.findMany.mockResolvedValue([
        { score: 30, createdAt: at(2) },
        { score: 40, createdAt: at(1) },
      ])
      const out = await service.item('u1', 'k1', 'i1')
      expect(out.attemptLog.map((a) => a.best)).toEqual([false, false])
      expect(out.attemptsBeforeLog).toBe(1)
    })

    it('does not read the log for a lesson', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(item('lesson'))
      prisma.itemProgress.findUnique.mockResolvedValue(null)
      const out = await service.item('u1', 'k1', 'i1')
      expect(out).toMatchObject({ attemptLog: [], attemptsBeforeLog: 0 })
      expect(prisma.itemAttempt.findMany).not.toHaveBeenCalled()
    })
  })

  it('holds course completion until the tool item itself is done', async () => {
    const lesson = item('lesson')
    prisma.courseItem.findUnique.mockResolvedValue(tool)
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    prisma.courseModule.findMany.mockResolvedValue([{ items: [{ ...lesson, id: 'l1' }, tool] }])
    finished('l1')
    await service.recordToolResult('u1', 'k1', 'i1', { scorePct: 80 })
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
    finished('l1', tool.id)
    await service.recordToolResult('u1', 'k1', 'i1', { scorePct: 80 })
    expect(prisma.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) })
    )
  })

  it('ignores a repeat of a report already recorded, so a retry is not a second attempt', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(tool)
    prisma.itemProgress.findUnique.mockResolvedValue({
      status: 'completed',
      score: 80,
      attempts: 2,
      data: {
        reportedAt: '2026-10-06T12:05:00.000Z',
        recentReportedAt: ['2026-10-06T12:00:00.000Z', '2026-10-06T12:05:00.000Z'],
      },
    })
    for (const at of ['2026-10-06T12:05:00Z', '2026-10-06T12:00:00Z']) {
      await service.recordToolResult('u1', 'k1', 'i1', { scorePct: 80, reportedAt: at })
    }
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled()
    await service.recordToolResult('u1', 'k1', 'i1', {
      scorePct: 85,
      reportedAt: '2026-10-06T12:10:00Z',
    })
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1)
  })

  it('counts a real score reported after one that carried a later timestamp', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(tool)
    prisma.itemProgress.findUnique.mockResolvedValue({
      status: 'completed',
      score: 60,
      attempts: 1,
      data: { reportedAt: '2099-01-01T00:00:00.000Z' },
    })
    await service.recordToolResult('u1', 'k1', 'i1', {
      scorePct: 80,
      reportedAt: '2026-10-06T12:00:00Z',
    })
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1)
  })

  it('treats a report that lost a race to its own twin as already recorded', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(tool)
    prisma.itemProgress.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ attempts: 1, data: { recentReportedAt: ['2026-10-06T12:00:00.000Z'] } })
    prisma.$queryRawUnsafe.mockResolvedValue([]) // the statement skipped the repeat
    await service.recordToolResult('u1', 'k1', 'i1', {
      scorePct: 80,
      reportedAt: '2026-10-06T12:00:00Z',
    })
    expect(prisma.courseModule.findMany).not.toHaveBeenCalled() // no plan or completion work
  })

  describe('concurrent reports', () => {
    /** Stands in for Postgres running the statement: one atomic step per call, on the live row. */
    function fakePostgres() {
      const row = { score: null as number | null, attempts: 0, recent: [] as string[] }
      let reads = 0
      prisma.itemProgress.findUnique.mockImplementation(async () =>
        // Both requests read before either writes; later reads see the row.
        ++reads <= 2 || row.attempts === 0
          ? null
          : { attempts: row.attempts, score: row.score, data: { recentReportedAt: row.recent } }
      )
      prisma.$queryRawUnsafe.mockImplementation(async (...a: unknown[]) => {
        const [score, reportedAt, limit] = [
          a[4] as number,
          a[6] as string | null,
          a[7] as number | null,
        ]
        if (reportedAt && row.recent.includes(reportedAt)) return []
        if (limit !== null && row.attempts >= limit) return []
        row.score = Math.max(row.score ?? 0, score)
        row.attempts += 1
        if (reportedAt) row.recent.push(reportedAt)
        return [{ attempts: row.attempts }]
      })
      return { row }
    }

    it('counts the same result reported twice at once only once', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(tool)
      const { row } = fakePostgres()
      const report = () =>
        service.recordToolResult('u1', 'k1', 'i1', {
          scorePct: 80,
          reportedAt: '2026-10-06T12:00:00Z',
        })
      await Promise.all([report(), report()])
      expect(row).toMatchObject({ score: 80, attempts: 1 })
    })

    it('keeps both attempts and the true best when different results arrive at once', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(tool)
      const { row } = fakePostgres()
      await Promise.all([
        service.recordToolResult('u1', 'k1', 'i1', {
          scorePct: 90,
          reportedAt: '2026-10-06T12:00:00Z',
        }),
        service.recordToolResult('u1', 'k1', 'i1', {
          scorePct: 60,
          reportedAt: '2026-10-06T12:01:00Z',
        }),
      ])
      expect(row).toMatchObject({ score: 90, attempts: 2 })
    })

    it('lets only one of two tabs take the single attempt of an assessment', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(
        item('tool', 'pre', { toolId: 'id-assessment', ref: 'cna-pre' })
      )
      const { row } = fakePostgres()
      const settled = await Promise.allSettled([
        service.recordToolResult('u1', 'k1', 'i1', {
          scorePct: 90,
          reportedAt: '2026-10-06T12:00:00Z',
        }),
        service.recordToolResult('u1', 'k1', 'i1', {
          scorePct: 60,
          reportedAt: '2026-10-06T12:01:00Z',
        }),
      ])
      expect(settled.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
      expect(row.attempts).toBe(1)
    })
  })

  describe('when scores are accepted', () => {
    const endedAgo = (ms: number) =>
      enrollment({ startsAt: PAST, endsAt: new Date(Date.now() - ms) })
    const HOUR = 3_600_000

    it('still takes a score for a cohort that ended within the last 24 hours', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(tool)
      prisma.enrollment.findUnique.mockResolvedValue(endedAgo(HOUR))
      await service.recordToolResult('u1', 'k1', 'i1', { scorePct: 70 })
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1)
    })

    it('refuses a score more than 24 hours after the cohort ended', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(tool)
      prisma.enrollment.findUnique.mockResolvedValue(endedAgo(25 * HOUR))
      await expect(service.recordToolResult('u1', 'k1', 'i1', { scorePct: 70 })).rejects.toThrow(
        'This cohort has ended.'
      )
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled()
    })

    it('refuses a score before the cohort starts', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(tool)
      prisma.enrollment.findUnique.mockResolvedValue(enrollment({ startsAt: FUTURE }))
      await expect(service.recordToolResult('u1', 'k1', 'i1', { scorePct: 70 })).rejects.toThrow(
        ConflictException
      )
    })
  })

  it('refuses other item types, a closed window, a stranger and a bad score', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(item('lesson'))
    await expect(service.recordToolResult('u1', 'k1', 'i1', { scorePct: 50 })).rejects.toThrow(
      ConflictException
    )
    prisma.courseItem.findUnique.mockResolvedValue(tool)
    prisma.enrollment.findUnique.mockResolvedValue(enrollment({ endsAt: PAST }))
    await expect(service.recordToolResult('u1', 'k1', 'i1', { scorePct: 50 })).rejects.toThrow(
      ConflictException
    )
    prisma.enrollment.findUnique.mockResolvedValue(null)
    await expect(service.recordToolResult('u1', 'k1', 'i1', { scorePct: 50 })).rejects.toThrow(
      NotFoundException
    )
    prisma.enrollment.findUnique.mockResolvedValue(enrollment())
    await expect(service.recordToolResult('u1', 'k1', 'i1', { scorePct: 101 })).rejects.toThrow(
      BadRequestException
    )
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled()
  })

  it('shows a learner the tool and its name on the item', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(tool)
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    expect((await service.item('u1', 'k1', 'i1')).tool).toEqual({
      toolId: 'id-interview',
      name: 'Interview Differently',
      ref: 'cna-interview',
      retries: true,
      reviewable: false,
      attemptsAllowed: null,
      timeLimitMinutes: null,
      passScore: null,
      optional: false,
    })
  })

  it('hides the tool when the course provider is not approved for it, so the item is unavailable', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(tool)
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    prisma.course.findUnique.mockResolvedValue({ provider: { id: 'p1', parentId: 'a1' } })
    setStoredTools(withFirstTool({ enabled: true, workspaceIds: ['someone-else'] }))
    try {
      expect((await service.item('u1', 'k1', 'i1')).tool).toBeNull()
      setStoredTools(withFirstTool({ enabled: true, workspaceIds: ['a1'] }))
      expect((await service.item('u1', 'k1', 'i1')).tool).toMatchObject({ toolId: 'id-interview' })
    } finally {
      resetToDefaults()
    }
  })

  it('an interview tool always has retries, however many attempts were made', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(tool)
    prisma.itemProgress.findUnique.mockResolvedValue({
      status: 'completed',
      score: 80,
      attempts: 9,
    })
    expect((await service.item('u1', 'k1', 'i1')).tool).toMatchObject({
      retries: true,
      reviewable: false,
      attemptsAllowed: null,
    })
  })

  describe('assessment tool attempts', () => {
    const assess = (config: object = {}) =>
      item('tool', 'pre', { toolId: 'id-assessment', ref: 'cna-pre', ...config })

    it('defaults to one attempt and no time limit; retries only while attempts remain', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(assess())
      prisma.itemProgress.findUnique.mockResolvedValue(null)
      const out = await service.item('u1', 'k1', 'i1')
      expect(out.label).toBe('pre')
      expect(out.tool).toEqual({
        toolId: 'id-assessment',
        name: 'Interview Differently assessment',
        ref: 'cna-pre',
        retries: true,
        reviewable: false,
        attemptsAllowed: 1,
        timeLimitMinutes: null,
        passScore: null,
        optional: false,
      })
      prisma.itemProgress.findUnique.mockResolvedValue({
        status: 'completed',
        score: 70,
        attempts: 1,
      })
      expect((await service.item('u1', 'k1', 'i1')).tool?.retries).toBe(false)
    })

    it('offers answer review only once every attempt is used, and only where the item allows it', async () => {
      const reviewable = async (label: string, config: object, attempts: number) => {
        prisma.courseItem.findUnique.mockResolvedValue(
          item('tool', label, { toolId: 'id-assessment', ref: 'cna', ...config })
        )
        prisma.itemProgress.findUnique.mockResolvedValue({
          status: 'completed',
          score: 70,
          attempts,
        })
        return (await service.item('u1', 'k1', 'i1')).tool?.reviewable
      }
      expect(await reviewable('post', {}, 1)).toBe(true) // post defaults on
      expect(await reviewable('post', {}, 0)).toBe(false) // nothing taken yet
      expect(await reviewable('post', { maxAttempts: 2 }, 1)).toBe(false) // an attempt left: no peeking
      expect(await reviewable('post', { maxAttempts: 2 }, 2)).toBe(true)
      expect(await reviewable('pre', {}, 1)).toBe(false) // pre defaults off
      expect(await reviewable('pre', { reviewAnswers: true }, 1)).toBe(true)
      expect(await reviewable('post', { reviewAnswers: false }, 1)).toBe(false)
    })

    it('exposes the configured limits and keeps retries until the last attempt is used', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(
        assess({ maxAttempts: 3, timeLimitMinutes: 45 })
      )
      prisma.itemProgress.findUnique.mockResolvedValue({
        status: 'completed',
        score: 70,
        attempts: 2,
      })
      expect((await service.item('u1', 'k1', 'i1')).tool).toMatchObject({
        retries: true,
        reviewable: false,
        attemptsAllowed: 3,
        timeLimitMinutes: 45,
      })
      prisma.itemProgress.findUnique.mockResolvedValue({
        status: 'completed',
        score: 70,
        attempts: 3,
      })
      expect((await service.item('u1', 'k1', 'i1')).tool?.retries).toBe(false)
    })

    it('passes the attempt cap to the statement for an assessment, none for an interview', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(assess({ maxAttempts: 3 }))
      prisma.itemProgress.findUnique.mockResolvedValue({
        status: 'completed',
        score: 85,
        attempts: 2,
      })
      await service.recordToolResult('u1', 'k1', 'i1', { scorePct: 60 })
      expect(statement().cap).toBe(3)
    })

    it('refuses a score with 409 once all attempts are used, so a second tab cannot take another', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(assess())
      prisma.itemProgress.findUnique.mockResolvedValue({
        status: 'completed',
        score: 85,
        attempts: 1,
      })
      await expect(
        service.recordToolResult('u1', 'k1', 'i1', {
          scorePct: 99,
          reportedAt: '2026-10-06T12:00:00Z',
        })
      ).rejects.toThrow('You have used all 1 attempts.')
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled()
    })

    it('refuses with 409 when the statement finds the attempts used up by a request that ran first', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(assess())
      prisma.itemProgress.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ attempts: 1, data: { recentReportedAt: ['other'] } })
      prisma.$queryRawUnsafe.mockResolvedValue([])
      await expect(
        service.recordToolResult('u1', 'k1', 'i1', {
          scorePct: 99,
          reportedAt: '2026-10-06T12:00:00Z',
        })
      ).rejects.toThrow(ConflictException)
    })

    it('accepts a retry of the report that used the last attempt as already recorded', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(assess())
      prisma.itemProgress.findUnique.mockResolvedValue({
        status: 'completed',
        score: 85,
        attempts: 1,
        data: { recentReportedAt: ['2026-10-06T12:00:00.000Z'] },
      })
      await expect(
        service.recordToolResult('u1', 'k1', 'i1', {
          scorePct: 85,
          reportedAt: '2026-10-06T12:00:00Z',
        })
      ).resolves.toBeTruthy()
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled()
    })

    it('does not count a repeated report of the same result as another attempt', async () => {
      prisma.courseItem.findUnique.mockResolvedValue(assess({ maxAttempts: 3 }))
      prisma.itemProgress.findUnique.mockResolvedValue({
        status: 'completed',
        score: 85,
        attempts: 1,
        data: { reportedAt: '2026-10-06T12:00:00.000Z' },
      })
      await service.recordToolResult('u1', 'k1', 'i1', {
        scorePct: 40,
        reportedAt: '2026-10-06T12:00:00Z',
      })
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled()
    })
  })

  it('holds course completion back while a pre/post assessment tool is not done', async () => {
    const lesson = item('lesson')
    const labelled = item('tool', 'post', { toolId: 'id-assessment', ref: 'cna-post' })
    prisma.courseItem.findUnique.mockResolvedValue(lesson)
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    prisma.courseModule.findMany.mockResolvedValue([
      {
        items: [
          { ...lesson, id: 'l1' },
          { ...labelled, id: 't1' },
        ],
      },
    ])
    finished('l1')
    await service.completeLesson('u1', 'k1', 'i1')
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
  })

  it('completes the course once the labelled assessment tool is done', async () => {
    const labelled = item('tool', 'post', { toolId: 'id-assessment', ref: 'cna-post' })
    prisma.courseItem.findUnique.mockResolvedValue(labelled)
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    prisma.courseModule.findMany.mockResolvedValue([
      { items: [{ ...item('lesson'), id: 'l1' }, labelled] },
    ])
    finished('l1', 'i1')
    await service.recordToolResult('u1', 'k1', 'i1', { scorePct: 80 })
    expect(prisma.enrollment.update).toHaveBeenCalled()
  })
})
