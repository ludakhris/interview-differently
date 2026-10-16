import { ConflictException } from '@nestjs/common'
import type { CheckpointHistoryEntry } from '../../core/monitor-types'
import { AdaptiveService } from './adaptive.service'
import { PERSONAS, T } from './demo-course'

const answer = (ref: string, correct: boolean, min: number): CheckpointHistoryEntry => ({
  kind: 'answer',
  at: `2026-10-18T10:0${min}:00.000Z`,
  itemId: 'cp',
  ref,
  prompt: `Request ${ref}`,
  from: null,
  sql: 'SELECT 1',
  correct,
  passed: false,
  reason: correct ? null : 'expected 4 row(s), got 79',
})

const running = { startsAt: new Date('2026-01-01'), endsAt: new Date('2099-01-01') }

function setup(opts: { config: Record<string, unknown>; history: CheckpointHistoryEntry[] }) {
  const course = { id: 'course', skills: [], adaptive: {}, providerId: 'p', targetRoles: [] }
  const enrollment = {
    id: 'en',
    userId: 'u',
    cohortId: 'c',
    status: 'active',
    cohort: { ...running, course },
  }
  const item = {
    id: 'cp',
    type: 'tool',
    title: 'Checkpoint',
    config: opts.config,
    module: { courseId: 'course' },
  }
  let progress: Record<string, unknown> | null = null
  const prisma = {
    enrollment: { findUnique: jest.fn().mockResolvedValue(enrollment) },
    courseItem: { findUnique: jest.fn().mockResolvedValue(item) },
    planItem: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    planSkip: { findMany: jest.fn().mockResolvedValue([]) },
    itemProgress: {
      findUnique: jest.fn(async () => progress),
      upsert: jest.fn(async (args: { create: Record<string, unknown> }) => {
        progress ??= { ...args.create }
        return progress
      }),
      updateMany: jest.fn(
        async (args: { where: { status: { not: string } }; data: Record<string, unknown> }) => {
          if (progress && progress.status !== args.where.status.not)
            progress = { ...progress, ...args.data }
          return { count: 1 }
        }
      ),
    },
    // The JSON merge in the database: `data || patch`.
    $executeRaw: jest.fn(async (_sql: TemplateStringsArray, patch: string) => {
      progress = {
        ...(progress ?? {}),
        data: { ...((progress?.data as object) ?? {}), ...JSON.parse(patch) },
      }
      return 1
    }),
  }
  const learner = { afterEvidence: jest.fn().mockResolvedValue([]), settle: jest.fn() }
  const feed = { checkpointHistory: jest.fn().mockResolvedValue(opts.history) }
  const service = new AdaptiveService(
    prisma as never,
    {} as never,
    learner as never,
    {} as never,
    {} as never,
    feed as never
  )
  return { service, learner, prisma, progress: () => progress }
}

const checkpoint = {
  toolId: 'id-checkpoint',
  ref: 'bank',
  tasks: [
    { ref: '1.1', skill: 'filter' },
    { ref: '1.2', skill: 'filter' },
  ],
}

describe('AdaptiveService.sync', () => {
  it('keeps the answers read from the Simulator and waits while a request is unanswered', async () => {
    const t = setup({ config: checkpoint, history: [answer('1.1', true, 1)] })
    const out = await t.service.sync('u', 'c', 'cp')
    expect(out.completed).toBe(false)
    expect(Date.parse(out.at)).not.toBeNaN()
    expect(t.learner.afterEvidence).not.toHaveBeenCalled()
    expect(t.progress()).toMatchObject({
      data: { results: [{ ref: '1.1', correct: true }] },
    })
  })

  it('finishes the checkpoint once every request has a result, scores it and updates the plan', async () => {
    const t = setup({
      config: checkpoint,
      history: [answer('1.1', true, 1), answer('1.2', false, 2)],
    })
    const out = await t.service.sync('u', 'c', 'cp')
    expect(out.completed).toBe(true)
    expect(t.progress()).toMatchObject({ status: 'completed', score: 50 })
    expect(t.learner.afterEvidence).toHaveBeenCalledWith('en', 'active', expect.anything(), 'cp')
  })

  it('leaves a practice slot open until its score arrives, and never treats it as evidence', async () => {
    const t = setup({
      config: {
        toolId: 'id-checkpoint',
        ref: 'bank',
        generated: { skill: 'filter' },
        remediationFor: 'filter',
        tasks: [],
      },
      history: [],
    })
    // A practice slot opens only for a learner whose plan has it.
    t.prisma.planItem.findUnique.mockResolvedValue({ itemId: 'cp' })
    const out = await t.service.sync('u', 'c', 'cp')
    expect(out.completed).toBe(false)
    expect(t.learner.afterEvidence).not.toHaveBeenCalled()
  })

  it('refuses an item that is not a checkpoint', async () => {
    const t = setup({ config: { toolId: 'id-assessment', ref: 'x' }, history: [] })
    await expect(t.service.sync('u', 'c', 'cp')).rejects.toThrow('Item not found')
  })
})

describe('AdaptiveService.intake', () => {
  const diagnostic = { ...checkpoint, diagnostic: true }

  it('keeps what the learner says about themselves, merged into the progress', async () => {
    const t = setup({ config: diagnostic, history: [] })
    await t.service.intake('u', 'c', 'cp', { level: 'some' })
    expect(t.progress()).toMatchObject({ data: { intake: 'some' } })
  })

  it('refuses once the learner has answered, so a skipped diagnostic never hides evidence', async () => {
    const t = setup({ config: diagnostic, history: [answer('1.1', true, 1)] })
    await expect(t.service.intake('u', 'c', 'cp', { level: 'never', fresh: true })).rejects.toThrow(
      'already started'
    )
  })
})

describe('AdaptiveService: AI content on the board', () => {
  const view = (over: Record<string, unknown>) => ({
    id: 'p1',
    skill: 'Joins',
    status: 'approved',
    intro: 'Intro',
    title: 'Title',
    tasks: ['Task'],
    scenes: [{ heading: 'H', narration: 'N' }],
    model: 'm',
    createdAt: '2026-10-14T09:00:00.000Z',
    reviewedBy: null,
    usedBy: [{ userId: 'u' }],
    ...over,
  })
  // `approveGenerated`: the course's "Staff approve AI-written practice and videos before learners see them".
  function board(approveGenerated = true) {
    const practice = {
      practiceInCohort: jest.fn(async () => [
        view({ id: 'p-shown' }),
        view({ id: 'p-pending', status: 'pending' }),
        view({ id: 'p-approved', reviewedBy: 'staff-1' }),
      ]),
      review: jest.fn(async () => ({})),
    }
    const spark = {
      lessonsInCohort: jest.fn(async () => [view({ id: 'l-shown' })]),
      reviewLesson: jest.fn(async () => ({})),
      previewLink: jest.fn(async () => 'https://spark.example.test/lesson#token=t'),
      lessonHistory: jest.fn(async () => [{ lessonId: 'l-given' }]),
    }
    const access = { authorize: jest.fn(async () => undefined) }
    const prisma = {
      enrollment: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
          where.id === 'e' ? { id: 'e', cohortId: 'c', userId: 'theo' } : null
        ),
      },
      cohort: {
        findUnique: jest.fn(async () => ({
          id: 'c',
          course: { id: 'course', adaptive: { approveGenerated } },
          institution: {},
        })),
      },
    }
    const service = new AdaptiveService(
      prisma as never,
      access as never,
      {} as never,
      practice as never,
      spark as never,
      {} as never
    )
    return { service, practice, spark, access }
  }
  const contentOf = (service: AdaptiveService, approveGenerated: boolean) =>
    (
      service as unknown as {
        contentOf: (
          c: string,
          n: Map<string, string>,
          approveGenerated: boolean
        ) => Promise<{ id: string; status: string; reviewed: boolean }[]>
      }
    ).contentOf('c', new Map([['u', 'Ana']]), approveGenerated)

  it('lists content shown without a person’s review, and pending content, saying whether a person approved it', async () => {
    const { service } = board()
    const rows = await contentOf(service, true)
    expect(rows.map((r) => [r.id, r.status, r.reviewed])).toEqual([
      ['p-shown', 'approved', false],
      ['p-pending', 'pending', false],
      ['p-approved', 'approved', true],
      ['l-shown', 'approved', false],
    ])
  })

  it('refuses a review whose approve is not true or false, before anything is sent back', async () => {
    const { service, practice, spark } = board()
    const actor = { userId: 'staff-1' } as never
    for (const approve of [undefined, 'false', 0, null])
      await expect(service.review(actor, 'c', 'p-shown', approve)).rejects.toThrow(
        'approve must be true or false'
      )
    expect(practice.review).not.toHaveBeenCalled()
    await service.review(actor, 'c', 'p-shown', false)
    expect(practice.review).toHaveBeenCalledWith('p-shown', false, 'staff-1', 'c')
    await service.review(actor, 'c', 'l-shown', true)
    expect(spark.reviewLesson).toHaveBeenCalledWith('l-shown', true, 'staff-1', 'c')
  })

  it('links course staff to watch a lesson used in the cohort, checking they are its staff first', async () => {
    const { service, spark, access } = board()
    const actor = { userId: 'staff-1' } as never
    await expect(service.previewLesson(actor, 'c', 'l-shown')).resolves.toEqual({
      url: 'https://spark.example.test/lesson#token=t',
    })
    expect(access.authorize).toHaveBeenCalledWith(actor, 'cohort.staff', { cohortId: 'c' })
    expect(spark.previewLink).toHaveBeenCalledWith('l-shown', 'staff-1')
  })

  it('refuses a preview of a lesson not used in the cohort, or of practice', async () => {
    const { service, spark } = board()
    const actor = { userId: 'staff-1' } as never
    for (const id of ['l-elsewhere', 'p-shown'])
      await expect(service.previewLesson(actor, 'c', id)).rejects.toThrow('Lesson not found')
    expect(spark.previewLink).not.toHaveBeenCalled()
  })

  it('refuses a preview to someone who is not the cohort’s staff', async () => {
    const { service, spark, access } = board()
    access.authorize.mockRejectedValueOnce(new Error('Insufficient role'))
    await expect(service.previewLesson({ userId: 'x' } as never, 'c', 'l-shown')).rejects.toThrow(
      'Insufficient role'
    )
    expect(spark.previewLink).not.toHaveBeenCalled()
  })

  it('links anyone who may see what a learner saw to play a video given to that learner', async () => {
    const { service, spark, access } = board()
    const actor = { userId: 'staff-1' } as never
    await expect(service.watchSeenLesson(actor, 'c', 'e', 'l-given')).resolves.toEqual({
      url: 'https://spark.example.test/lesson#token=t',
    })
    expect(access.authorize).toHaveBeenCalledWith(actor, 'cohort.read', { cohortId: 'c' })
    expect(spark.lessonHistory).toHaveBeenCalledWith('c', 'theo')
    expect(spark.previewLink).toHaveBeenCalledWith('l-given', 'staff-1')
  })

  it('refuses to play a video the learner was not given, or for a learner not in the cohort', async () => {
    const { service, spark } = board()
    const actor = { userId: 'staff-1' } as never
    await expect(service.watchSeenLesson(actor, 'c', 'e', 'l-shown')).rejects.toThrow(
      'Lesson not found'
    )
    await expect(service.watchSeenLesson(actor, 'c', 'other', 'l-given')).rejects.toThrow(
      'Learner not found'
    )
    expect(spark.previewLink).not.toHaveBeenCalled()
  })

  // Approval off: AI content goes straight to learners as the course chose, so the board asks staff to review nothing
  // of it (platform admins still approve for reuse in Content review). Only content still held from when approval was
  // on is listed, since a learner waits on it.
  describe('with content approval off for the course', () => {
    it('lists nothing shown to learners for review, only content still held from when approval was on', async () => {
      const { service } = board(false)
      const rows = await contentOf(service, false)
      expect(rows.map((r) => [r.id, r.status])).toEqual([['p-pending', 'pending']])
    })

    it('refuses to approve or send back content already shown to learners, and reviews held content', async () => {
      const { service, practice, spark } = board(false)
      const actor = { userId: 'staff-1' } as never
      for (const [id, approve] of [
        ['p-shown', true],
        ['p-shown', false],
        ['l-shown', true],
      ] as const)
        await expect(service.review(actor, 'c', id, approve)).rejects.toThrow(
          'Content approval is off'
        )
      expect(practice.review).not.toHaveBeenCalled()
      expect(spark.reviewLesson).not.toHaveBeenCalled()
      await service.review(actor, 'c', 'p-pending', true)
      expect(practice.review).toHaveBeenCalledWith('p-pending', true, 'staff-1', 'c')
    })
  })
})

describe('AdaptiveService: video titles on the board path', () => {
  const item = (over: Record<string, unknown>) => ({
    itemId: 'v1',
    moduleTitle: 'M',
    title: 'Video made for you: filters',
    type: 'spark_lesson',
    minutes: 2,
    skill: 's',
    state: 'added_done',
    reason: null,
    at: null,
    evidence: null,
    ...over,
  })
  function titles(lessonTitle: jest.Mock) {
    const service = new AdaptiveService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { lessonTitle } as never,
      {} as never
    )
    return (path: ReturnType<typeof item>[]) =>
      (
        service as unknown as {
          withLessonTitles: (c: string, u: string, p: unknown[]) => Promise<void>
        }
      ).withLessonTitles('c', 'u', path)
  }

  it('shows the title Spark gave the learner’s video, and asks only for videos still on the path', async () => {
    const lessonTitle = jest.fn(async () => 'Finding Missing Values: IS NULL')
    const path = [
      item({}),
      item({ itemId: 'v2', state: 'skipped' }),
      item({ itemId: 'x', type: 'lesson' }),
    ]
    await titles(lessonTitle)(path)
    expect(path.map((p) => p.title)).toEqual([
      'Finding Missing Values: IS NULL',
      'Video made for you: filters',
      'Video made for you: filters',
    ])
    expect(lessonTitle).toHaveBeenCalledTimes(1)
    expect(lessonTitle).toHaveBeenCalledWith({ cohortId: 'c', userId: 'u', itemId: 'v1' })
  })

  it('keeps the slot’s title when Spark has none yet or cannot answer', async () => {
    const none = [item({})]
    await titles(jest.fn(async () => null))(none)
    expect(none[0].title).toBe('Video made for you: filters')
    const failing = [item({})]
    await titles(jest.fn(async () => Promise.reject(new Error('down'))))(failing)
    expect(failing[0].title).toBe('Video made for you: filters')
  })
})

describe('AdaptiveService.demoStep: working through practice', () => {
  const theo = PERSONAS.find((p) => p.id === 'theo')!
  const at = theo.steps.findIndex((s) => s.do === 'solve' && s.item === T.practice.aggregate)

  it('gives Theo’s grouping gap both pieces of help, done, before the retry that proves it', () => {
    const miss = theo.steps.findIndex(
      (s) => s.do === 'submit' && s.ref === '3.4' && s.sql.includes('WHERE COUNT')
    )
    const retry = theo.steps.findIndex(
      (s) => s.do === 'submit' && s.ref === '3.4' && s.sql.includes('HAVING')
    )
    const after = theo.steps
      .slice(miss + 1, retry)
      .filter((s) => s.do !== 'help')
      .map((s) => [s.do, 'item' in s ? s.item : null])
    expect(after).toEqual([
      ['practice', T.practice.aggregate],
      ['solve', T.practice.aggregate],
      ['video', T.video.aggregate],
      ['watch', T.video.aggregate],
    ])
  })

  function demo(solved: { status: string; done: boolean; scorePct: number | null }) {
    const course = { id: 'course', skills: [], adaptive: {} }
    const items = [
      {
        id: 'diag',
        type: 'tool',
        title: T.diagnostic,
        config: { toolId: 'id-checkpoint', ref: 'bank', diagnostic: true, tasks: [] },
      },
      {
        id: 'prac',
        type: 'tool',
        title: T.practice.aggregate,
        config: {
          toolId: 'id-checkpoint',
          ref: 'bank',
          generated: { skill: 'aggregate' },
          remediationFor: 'aggregate',
          tasks: [],
        },
      },
    ]
    const prisma = {
      cohort: {
        findUnique: jest.fn(async () => ({ id: 'c', course, institution: { featuredDemo: true } })),
      },
      courseItem: { findMany: jest.fn(async () => items) },
      enrollment: {
        findUnique: jest.fn(async () => ({
          id: 'en',
          progress: [{ itemId: 'diag', data: { demo: { step: at } } }],
        })),
      },
      itemProgress: {
        findUnique: jest.fn(async () => ({ data: { demo: { step: at } } })),
        upsert: jest.fn(async () => ({})),
      },
    }
    const access = { authorize: jest.fn(async () => undefined) }
    const learner = { recordToolResult: jest.fn(async () => ({})) }
    const practice = { demoSolve: jest.fn(async () => solved) }
    const service = new AdaptiveService(
      prisma as never,
      access as never,
      learner as never,
      practice as never,
      {} as never,
      {} as never
    )
    const sync = jest
      .spyOn(service, 'sync')
      .mockResolvedValue({ completed: true, at: '', planAdded: [], planSkipped: [] })
    return { service, prisma, learner, practice, sync }
  }

  it('finishes the practice slot and sends its score to the course, as a finished checkpoint does', async () => {
    const t = demo({ status: 'ready', done: true, scorePct: 100 })
    const out = await t.service.demoStep({ userId: 'staff' }, 'c', 'theo')
    expect(t.practice.demoSolve).toHaveBeenCalledWith(
      { cohortId: 'c', userId: theo.userId, itemId: 'prac' },
      expect.objectContaining({ refs: [], practice: expect.objectContaining({ evidenceRefs: [] }) })
    )
    expect(t.learner.recordToolResult).toHaveBeenCalledWith(theo.userId, 'c', 'prac', {
      scorePct: 100,
    })
    expect(t.sync).toHaveBeenCalledWith(theo.userId, 'c', 'prac', expect.any(String))
    expect(out).toMatchObject({ done: false, step: 'solve', say: theo.steps[at].say })
    expect(t.prisma.itemProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { data: { demo: { step: at + 1 } } } })
    )
  })

  it('stops, without counting the step, while the practice waits for staff review', async () => {
    const t = demo({ status: 'pending', done: false, scorePct: null })
    await expect(t.service.demoStep({ userId: 'staff' }, 'c', 'theo')).rejects.toThrow(
      ConflictException
    )
    await expect(t.service.demoStep({ userId: 'staff' }, 'c', 'theo')).rejects.toThrow(
      'waiting for review'
    )
    expect(t.learner.recordToolResult).not.toHaveBeenCalled()
    expect(t.prisma.itemProgress.upsert).not.toHaveBeenCalled()
  })
})
