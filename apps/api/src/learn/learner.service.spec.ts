import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { ClerkService } from '../auth/clerk.service'
import type { PrismaService } from '../prisma/prisma.service'
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
  courseItem: { findUnique: jest.fn() },
  courseModule: { findMany: jest.fn() },
  itemProgress: { findUnique: jest.fn(), upsert: jest.fn(), count: jest.fn(), findMany: jest.fn() },
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
})

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
    prisma.courseItem.findUnique.mockResolvedValue(item('assessment', 'pre', { questions: quiz }))
    prisma.itemProgress.findUnique.mockResolvedValue(null)
    const { result } = await service.submitQuiz('u1', 'k1', 'i1', [1, 0])
    expect(result.score).toBe(50)
    expect(prisma.itemProgress.upsert.mock.calls[0][0].create).toMatchObject({
      status: 'completed',
      score: 50,
    })
  })

  it('lets a pre or post assessment be taken only once', async () => {
    prisma.courseItem.findUnique.mockResolvedValue(item('assessment', 'post', { questions: quiz }))
    prisma.itemProgress.findUnique.mockResolvedValue({ status: 'completed', score: 90 })
    await expect(service.submitQuiz('u1', 'k1', 'i1', [1, 1])).rejects.toThrow(ConflictException)
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

describe('completion', () => {
  it('completes the enrollment when everything but the interview is done', async () => {
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
    prisma.itemProgress.count.mockResolvedValue(1) // the lesson; the interview is not required
    await service.completeLesson('u1', 'k1', 'i1')
    expect(prisma.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: expect.objectContaining({ status: 'completed' }),
    })
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
    prisma.itemProgress.count.mockResolvedValue(1)
    await service.completeLesson('u1', 'k1', 'i1')
    expect(prisma.enrollment.update).not.toHaveBeenCalled()
  })
})

describe('buildRecord', () => {
  const items = [
    { id: 'a', type: 'assessment', label: 'pre' },
    { id: 'b', type: 'assessment', label: 'post' },
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
    prisma.itemProgress.count.mockResolvedValue(1)
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
    prisma.itemProgress.count.mockResolvedValue(1)
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
