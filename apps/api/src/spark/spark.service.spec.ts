import { Logger, ServiceUnavailableException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'
import type { LessonRequest } from '../core/spark-port'
import { LessonFailureLog } from './lesson-failure-log'
import { LESSON_PROMPT_VERSION } from './lessons'
import { verifyPlayerToken, verifyPreviewToken } from './player-token'
import { addUsage, SparkService } from './spark.service'

jest.mock('./voice', () => ({
  canSpeak: jest.fn(() => false),
  speak: jest.fn(async () => Buffer.from('wav')),
}))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const voice = require('./voice') as { canSpeak: jest.Mock; speak: jest.Mock }

interface Row {
  id: string
  createdAt: Date
  [k: string]: unknown
}

/** Just enough of Prisma for Spark's queries, in memory. */
function fakeDb() {
  let n = 0
  let clock = 1_000
  const lessons: Row[] = []
  const uses: Row[] = []
  const events: Row[] = []
  const failures: Row[] = []
  const stamp = (data: Record<string, unknown>): Row => ({
    id: `id${++n}`,
    createdAt: new Date(clock++),
    ...data,
  })
  const matches = (row: Row, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'OR') return (v as Record<string, unknown>[]).some((w) => matches(row, w))
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        const op = v as { in?: unknown[]; notIn?: unknown[]; not?: unknown }
        if (op.in) return op.in.includes(row[k])
        if (op.notIn) return !op.notIn.includes(row[k])
        if ('not' in op) return row[k] !== op.not
      }
      return row[k] === v
    })
  const newest = (rows: Row[]) => [...rows].sort((a, b) => +b.createdAt - +a.createdAt)
  const withLesson = (u: Row, include?: Record<string, unknown>) =>
    include
      ? {
          ...u,
          lesson: lessons.find((l) => l.id === u.lessonId),
          ...(include.events ? { events: events.filter((e) => e.lessonUseId === u.id) } : {}),
        }
      : u
  const db = {
    lesson: {
      findFirst: jest.fn(
        async ({ where }) => newest(lessons.filter((l) => matches(l, where)))[0] ?? null
      ),
      findMany: jest.fn(async ({ where }) => newest(lessons.filter((l) => matches(l, where)))),
      findUnique: jest.fn(async ({ where }) => lessons.find((l) => l.id === where.id) ?? null),
      create: jest.fn(async ({ data }) => {
        const row = stamp({ reviewedBy: null, reviewedAt: null, ...data })
        lessons.push(row)
        return row
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = lessons.find((l) => l.id === where.id)!
        Object.assign(row, data)
        return row
      }),
      count: jest.fn(async ({ where }) => lessons.filter((l) => matches(l, where)).length),
    },
    lessonUse: {
      findFirst: jest.fn(async ({ where, include }) => {
        const u = newest(uses.filter((r) => matches(r, where)))[0]
        return u ? withLesson(u, include) : null
      }),
      findUnique: jest.fn(async ({ where, include }) => {
        const u = uses.find((r) => r.id === where.id)
        return u ? withLesson(u, include) : null
      }),
      findMany: jest.fn(async ({ where, include }) =>
        newest(uses.filter((r) => matches(r, where))).map((u) => withLesson(u, include))
      ),
      create: jest.fn(async ({ data }) => {
        const row = stamp({ sentBackAt: null, ...data })
        uses.push(row)
        return row
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const hit = uses.filter((r) => matches(r, where))
        for (const r of hit) Object.assign(r, data)
        return { count: hit.length }
      }),
      count: jest.fn(async ({ where }) => uses.filter((r) => matches(r, where)).length),
      deleteMany: jest.fn(async ({ where }) => {
        const gone = uses.filter((r) => matches(r, where))
        for (const g of gone) {
          uses.splice(uses.indexOf(g), 1)
          for (const e of events.filter((x) => x.lessonUseId === g.id))
            events.splice(events.indexOf(e), 1)
        }
        return { count: gone.length }
      }),
    },
    serviceFailure: {
      create: jest.fn(async ({ data }) => {
        const row = stamp(data)
        failures.push(row)
        return row
      }),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    lessonEvent: {
      count: jest.fn(async ({ where }) => events.filter((e) => matches(e, where)).length),
      findMany: jest.fn(async ({ where }) => events.filter((e) => matches(e, where))),
      create: jest.fn(async ({ data }) => {
        const row = stamp(data)
        events.push(row)
        return row
      }),
      createMany: jest.fn(async ({ data }) => {
        for (const d of data) events.push(stamp(d))
        return { count: data.length }
      }),
    },
  }
  return { db, lessons, uses, events, failures }
}

const scenes = [0, 1, 2].map((i) => ({
  heading: `Scene ${i}`,
  narration: `Narration ${i}`,
  visual: { kind: 'bullets', items: ['x'] },
}))

const slot = { cohortId: 'c1', userId: 'learner-1', itemId: 'item-1' }
const request = (over: Partial<LessonRequest> = {}): LessonRequest => ({
  slot,
  skill: 'Joins',
  level: null,
  misses: [],
  tables: 'orders(id, customer_id)',
  review: false,
  ...over,
})

const storyboard = JSON.stringify({
  title: 'Joining two tables',
  scenes: [0, 1, 2].map((i) => ({
    heading: `H${i}`,
    narration: `N${i}`,
    kind: 'bullets',
    sub: '',
    code: '',
    highlight: [],
    columns: [],
    rows: [],
    highlightRows: [],
    leftLabel: '',
    left: '',
    rightLabel: '',
    right: '',
    items: ['one'],
  })),
})

function fakeClaude(replies: string[]) {
  let i = 0
  return {
    messages: {
      create: jest.fn(async () => ({
        model: 'claude-sonnet-5-5',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: replies[Math.min(i++, replies.length - 1)] }],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 10,
          cache_creation_input_tokens: null,
        },
      })),
    },
  }
}

function setup(replies: string[] = [storyboard]) {
  const fake = fakeDb()
  const log = new LessonFailureLog(fake.db as unknown as PrismaService)
  const service = new SparkService(fake.db as unknown as PrismaService, log)
  const claude = fakeClaude(replies)
  ;(service as unknown as { client: unknown }).client = claude
  return { ...fake, service, claude, log }
}

const approvedLesson = (over: Record<string, unknown> = {}) => ({
  skill: 'Joins',
  level: null,
  title: 'Approved joins',
  scenes,
  status: 'approved',
  model: 'm',
  promptVersion: 'p',
  reviewedBy: 'staff-1',
  reviewedAt: new Date(),
  ...over,
})

beforeEach(() => {
  voice.canSpeak.mockReturnValue(false)
})

describe('makeLesson', () => {
  it('reuses an approved, person-reviewed lesson on the skill before writing one', async () => {
    const { service, db, claude, uses } = setup()
    const lesson = await db.lesson.create({ data: approvedLesson() })
    const state = await service.makeLesson(request())
    expect(claude.messages.create).not.toHaveBeenCalled()
    expect(state).toMatchObject({ status: 'ready', lessonId: lesson.id, finished: false })
    expect(uses).toHaveLength(1)
    expect(uses[0]).toMatchObject({ lessonId: lesson.id, ...slot })
  })

  it('never reuses a lesson nobody reviewed, a pending one, another skill, or one this learner had', async () => {
    const { service, db, claude, lessons } = setup()
    await db.lesson.create({ data: approvedLesson({ reviewedBy: null }) })
    await db.lesson.create({ data: approvedLesson({ status: 'pending' }) })
    await db.lesson.create({ data: approvedLesson({ skill: 'Grouping' }) })
    const had = await db.lesson.create({ data: approvedLesson() })
    await db.lessonUse.create({
      data: { lessonId: had.id, cohortId: 'c1', userId: 'learner-1', itemId: 'earlier-item' },
    })
    const state = await service.makeLesson(request())
    expect(claude.messages.create).toHaveBeenCalledTimes(1)
    expect(state.lessonId).toBe(lessons[lessons.length - 1].id)
    expect(state.title).toBe('Joining two tables')
  })

  it("prefers a lesson written for the learner's level, then any level", async () => {
    const { service, db } = setup()
    await db.lesson.create({ data: approvedLesson({ level: 'expert' }) })
    const same = await db.lesson.create({ data: approvedLesson({ level: 'beginner' }) })
    const newestOther = await db.lesson.create({ data: approvedLesson({ level: 'expert' }) })
    expect((await service.makeLesson(request({ level: 'beginner' }))).lessonId).toBe(same.id)
    // The beginner lesson is now this learner's, so the next slot gets the newest of any level.
    const second = await service.makeLesson(
      request({ level: 'beginner', slot: { ...slot, itemId: 'item-2' } })
    )
    expect(second.lessonId).toBe(newestOther.id)
  })

  it('never reuses a lesson whose SQL uses a table this course does not have', async () => {
    const { service, db, claude } = setup()
    const sqlScenes = (code: string) => [
      ...scenes.slice(0, 2),
      { heading: 'SQL', narration: 'n', visual: { kind: 'sql', code, highlight: [] } },
    ]
    await db.lesson.create({
      data: approvedLesson({ scenes: sqlScenes('SELECT * FROM orders JOIN products p ON true') }),
    })
    const fits = await db.lesson.create({
      data: approvedLesson({ scenes: sqlScenes('SELECT * FROM orders o') }),
    })
    await db.lesson.create({
      data: approvedLesson({ scenes: sqlScenes('SELECT * FROM shipments') }),
    })
    expect((await service.makeLesson(request())).lessonId).toBe(fits.id)
    expect(claude.messages.create).not.toHaveBeenCalled()
    // a course with other tables gets a lesson of its own
    const other = await service.makeLesson(
      request({ slot: { ...slot, cohortId: 'c2' }, tables: 'patients (id, name)' })
    )
    expect(claude.messages.create).toHaveBeenCalledTimes(1)
    expect(other.title).toBe('Joining two tables')
  })

  it('returns what the slot already has instead of making another', async () => {
    const { service, claude } = setup()
    const first = await service.makeLesson(request())
    const again = await service.makeLesson(request())
    expect(again.lessonId).toBe(first.lessonId)
    expect(claude.messages.create).toHaveBeenCalledTimes(1)
  })

  it('stores a written lesson with its model, prompt version and token counts summed over tries', async () => {
    const { service, lessons, claude } = setup(['not json', storyboard])
    await service.makeLesson(request({ level: 'beginner' }))
    expect(claude.messages.create).toHaveBeenCalledTimes(2)
    expect(lessons[0]).toMatchObject({
      skill: 'Joins',
      level: 'beginner',
      status: 'approved',
      model: 'claude-sonnet-5-5',
      promptVersion: LESSON_PROMPT_VERSION,
      inputTokens: 200,
      outputTokens: 100,
      cacheReadTokens: 20,
      cacheWriteTokens: 0,
      reviewedBy: null,
    })
  })

  it('holds a written lesson for review when asked, with no link or title until it is approved', async () => {
    const { service } = setup()
    const state = await service.makeLesson(request({ review: true }))
    expect(state).toMatchObject({ status: 'pending', url: null, title: null })
    expect(await service.lessonTitle(slot)).toBeNull()
    await service.reviewLesson(state.lessonId!, true, 'staff-1', 'c1')
    const after = await service.lessonSlot(slot)
    expect(after.status).toBe('ready')
    expect(after.title).toBe('Joining two tables')
    expect(after.url).toMatch(/^http:\/\/localhost:5175\/lesson#token=/)
    expect(await service.lessonTitle(slot)).toBe('Joining two tables')
  })

  it('replaces a rejected lesson with a new one', async () => {
    const { service } = setup()
    const first = await service.makeLesson(request({ review: true }))
    const rejected = await service.reviewLesson(first.lessonId!, false, 'staff-1', 'c1')
    expect(rejected).toMatchObject({ status: 'rejected', usedBy: [] })
    // the send-back took it from the slot, which can now be given a new one
    expect((await service.lessonSlot(slot)).status).toBe('none')
    const next = await service.makeLesson(request({ review: true }))
    expect(next.lessonId).not.toBe(first.lessonId)
    expect(next.status).toBe('pending')
  })

  it('fails without storing anything when no usable storyboard comes back', async () => {
    const { service, lessons, uses } = setup(['{"title":"x","scenes":[]}'])
    await expect(service.makeLesson(request())).rejects.toThrow('Could not write that lesson')
    expect(lessons).toHaveLength(0)
    expect(uses).toHaveLength(0)
  })
})

describe('recording lessons a learner could not get (System status, GitHub issue #92)', () => {
  it("records 'no-lesson' when two tries give no usable lesson", async () => {
    const { service, claude, failures } = setup(['{"title":"x","scenes":[]}'])
    await expect(service.makeLesson(request())).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(claude.messages.create).toHaveBeenCalledTimes(2)
    expect(failures).toMatchObject([
      { service: 'lessons', kind: 'no-lesson', reason: 'Could not write that lesson. Try again.' },
    ])
  })

  it("records 'not-configured' when the AI service is not configured", async () => {
    const { service, failures } = setup()
    ;(service as unknown as { client: unknown }).client = null
    expect(service.aiConfigured()).toBe(false)
    await expect(service.makeLesson(request())).rejects.toThrow(
      'Lessons made for you need the AI service, which is not configured.'
    )
    expect(failures).toMatchObject([{ service: 'lessons', kind: 'not-configured' }])
  })

  it('records nothing when a lesson is written or reused', async () => {
    const { service, failures } = setup()
    await service.makeLesson(request())
    expect(failures).toHaveLength(0)
  })

  it("never breaks the learner's request: a failed or slow write still gives the learner the same answer", async () => {
    const { service, db } = setup(['{"title":"x","scenes":[]}'])
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    db.serviceFailure.create.mockRejectedValueOnce(new Error('connection refused'))
    await expect(service.makeLesson(request())).rejects.toThrow('Could not write that lesson')
    await new Promise((r) => setImmediate(r))
    expect(error).toHaveBeenCalledWith(expect.stringContaining('connection refused'))
    // a write that never finishes does not hold the answer back
    db.serviceFailure.create.mockImplementationOnce(() => new Promise(() => undefined))
    await expect(service.makeLesson(request())).rejects.toThrow('Could not write that lesson')
    error.mockRestore()
  })

  it('treats a client with no key as not configured', () => {
    const env = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN }
    try {
      const { service } = setup()
      const reset = () => ((service as unknown as { client: unknown }).client = undefined)
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.ANTHROPIC_AUTH_TOKEN
      reset()
      expect(service.aiConfigured()).toBe(false)
      process.env.ANTHROPIC_API_KEY = 'test-key'
      reset()
      expect(service.aiConfigured()).toBe(true)
    } finally {
      for (const [k, v] of [
        ['ANTHROPIC_API_KEY', env.key],
        ['ANTHROPIC_AUTH_TOKEN', env.token],
      ] as const)
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
    }
  })
})

describe('lessonSlot', () => {
  it("is 'none' for an empty slot", async () => {
    const { service } = setup()
    expect(await service.lessonSlot(slot)).toEqual({
      status: 'none',
      lessonId: null,
      title: null,
      url: null,
      finished: false,
    })
  })

  it('signs the link for this learner and slot, and reports a finish', async () => {
    const { service, uses } = setup()
    await service.makeLesson(request())
    const state = await service.lessonSlot(slot)
    const token = verifyPlayerToken(state.url!.split('#token=')[1])
    expect(token).toMatchObject({
      sub: 'learner-1',
      cohortId: 'c1',
      itemId: 'item-1',
      useId: uses[0].id,
    })
    await service.recordEvent(token!, { event: 'finish', scene: 2 })
    // a finish alone is not watching it: every scene must have been reached
    expect((await service.lessonSlot(slot)).finished).toBe(false)
    for (const scene of [0, 1]) await service.recordEvent(token!, { event: 'scene', scene })
    expect((await service.lessonSlot(slot)).finished).toBe(false)
    await service.recordEvent(token!, { event: 'scene', scene: 2 })
    expect((await service.lessonSlot(slot)).finished).toBe(true)
    expect((await service.playerView(token!)).finished).toBe(true)
  })
})

describe('the player', () => {
  async function opened() {
    const s = setup()
    const state = await s.service.makeLesson(request())
    const token = verifyPlayerToken(state.url!.split('#token=')[1])!
    return { ...s, token }
  }

  it('shows the lesson the link opens', async () => {
    const { service, token } = await opened()
    expect(await service.playerView(token)).toEqual({
      title: 'Joining two tables',
      scenes: expect.any(Array),
      voice: false,
      finished: false,
    })
  })

  it("refuses a link for someone else's use of the lesson", async () => {
    const { service, token } = await opened()
    await expect(service.playerView({ ...token, sub: 'learner-2' })).rejects.toThrow(
      'not available'
    )
    await expect(service.playerView({ ...token, itemId: 'other' })).rejects.toThrow('not available')
  })

  it('records events as the learner and refuses ones the player never sends', async () => {
    const { service, token, events } = await opened()
    expect(await service.recordEvent(token, { event: 'scene', scene: 1, voice: 'browser' })).toBe(
      true
    )
    expect(await service.recordEvent(token, { event: 'complete' })).toBe(false)
    expect(events).toEqual([
      expect.objectContaining({
        event: 'scene',
        data: { scene: 1, voice: 'browser' },
        userId: 'learner-1',
        cohortId: 'c1',
      }),
    ])
    expect(events[0]).not.toHaveProperty('agencyId')
  })

  it('reads a scene aloud only where the server can speak', async () => {
    const { service, token } = await opened()
    expect(await service.sceneAudio(token, 0)).toBeNull()
    voice.canSpeak.mockReturnValue(true)
    expect(await service.sceneAudio(token, 1)).toEqual(Buffer.from('wav'))
    expect(voice.speak).toHaveBeenLastCalledWith('N1')
    await expect(service.sceneAudio(token, 9)).rejects.toThrow('No such scene')
  })
})

describe('a reviewer preview', () => {
  async function previewOf(status: string, over: Record<string, unknown> = {}) {
    const s = setup()
    const lesson = await s.db.lesson.create({
      data: approvedLesson({ status, reviewedBy: null, ...over }),
    })
    const url = await s.service.previewLink(lesson.id, 'reviewer-1')
    const token = verifyPreviewToken(url.split('#token=')[1])!
    return { ...s, lesson, url, token }
  }

  it('links the player to the lesson by its id, for the reviewer', async () => {
    const { url, token, lesson } = await previewOf('pending')
    expect(url).toMatch(/\/lesson#token=/)
    expect(token).toMatchObject({ preview: true, sub: 'reviewer-1', lessonId: lesson.id })
    expect(verifyPlayerToken(url.split('#token=')[1])).toBeNull()
  })

  it('plays a lesson in any status, saying it is a preview', async () => {
    for (const status of ['pending', 'approved', 'rejected']) {
      const { service, token } = await previewOf(status)
      expect(await service.playerView(token)).toEqual({
        title: 'Approved joins',
        scenes,
        voice: false,
        finished: false,
        preview: true,
      })
    }
  })

  it('plays a lesson sent back in a cohort, and reads its scenes aloud', async () => {
    const { service, token, db, lesson } = await previewOf('approved')
    await db.lessonUse.create({
      data: { lessonId: lesson.id, ...slot, sentBackAt: new Date() },
    })
    expect((await service.playerView(token)).preview).toBe(true)
    voice.canSpeak.mockReturnValue(true)
    expect(await service.sceneAudio(token, 1)).toEqual(Buffer.from('wav'))
    expect(voice.speak).toHaveBeenLastCalledWith('Narration 1')
    await expect(service.sceneAudio(token, 9)).rejects.toThrow('No such scene')
  })

  it('touches no learner: no use, no event, no read of anyone’s watch history', async () => {
    const { service, token, uses, events, db } = await previewOf('approved')
    await service.playerView(token)
    await service.sceneAudio(token, 0)
    expect(uses).toEqual([])
    expect(events).toEqual([])
    expect(db.lessonUse.findUnique).not.toHaveBeenCalled()
    expect(db.lessonEvent.findMany).not.toHaveBeenCalled()
  })

  it('refuses a lesson that does not exist', async () => {
    const { service } = setup()
    await expect(service.previewLink('missing', 'reviewer-1')).rejects.toThrow('Lesson not found')
  })
})

describe('reviewLesson', () => {
  async function sharedLesson(status: string) {
    const s = setup()
    const lesson = await s.db.lesson.create({ data: approvedLesson({ status, reviewedBy: null }) })
    for (const [cohortId, userId] of [
      ['c1', 'learner-1'],
      ['c1', 'learner-2'],
      ['c2', 'learner-3'],
    ])
      await s.db.lessonUse.create({
        data: { lessonId: lesson.id, cohortId, userId, itemId: 'item-1' },
      })
    return { ...s, lesson }
  }

  it('approves a pending lesson and lists only this cohort’s uses', async () => {
    const { service, lesson } = await sharedLesson('pending')
    const view = await service.reviewLesson(lesson.id, true, 'staff-1', 'c1')
    expect(view.status).toBe('approved')
    expect(lesson).toMatchObject({ status: 'approved', reviewedBy: 'staff-1' })
    expect(view.usedBy.map((u) => u.userId).sort()).toEqual(['learner-1', 'learner-2'])
    const [listed] = await service.lessonsInCohort('c2')
    expect(listed.usedBy.map((u) => u.userId)).toEqual(['learner-3'])
  })

  it('leaves an already approved lesson as it was reviewed', async () => {
    const { service, db } = setup()
    const lesson = await db.lesson.create({ data: approvedLesson() })
    await service.reviewLesson(lesson.id, true, 'staff-2', 'c1')
    expect(lesson.reviewedBy).toBe('staff-1')
  })

  it('a send-back takes the lesson from this cohort only, keeping it for another cohort', async () => {
    const { service, lesson, uses, events } = await sharedLesson('approved')
    events.push({ id: 'e1', createdAt: new Date(), lessonUseId: uses[0].id, event: 'start' })
    const view = await service.reviewLesson(lesson.id, false, 'staff-1', 'c1')
    // marked, not deleted: the uses and how they were watched stay as history
    expect(uses).toHaveLength(3)
    expect(uses.filter((u) => u.sentBackAt).map((u) => u.userId)).toEqual([
      'learner-1',
      'learner-2',
    ])
    expect(events).toHaveLength(1)
    expect(view).toMatchObject({ status: 'approved', usedBy: [] })
    expect(lesson.status).toBe('approved')
    expect((await service.lessonHistory('c1', 'learner-1')).map((h) => h.title)).toEqual([
      'Approved joins',
    ])
    // it leaves this cohort's board, and the learners sent back can be given a lesson again
    expect(await service.lessonsInCohort('c1')).toEqual([])
    expect((await service.lessonsInCohort('c2'))[0].usedBy.map((u) => u.userId)).toEqual([
      'learner-3',
    ])
    expect((await service.lessonSlot({ ...slot, userId: 'learner-1' })).status).toBe('none')
    expect(await service.lessonTitle({ ...slot, userId: 'learner-1' })).toBeNull()
  })

  it('a link to a sent-back use no longer plays', async () => {
    const { service, db } = setup()
    await db.lesson.create({ data: approvedLesson() })
    const state = await service.makeLesson(request())
    const token = verifyPlayerToken(state.url!.split('#token=')[1])!
    await service.reviewLesson(state.lessonId!, false, 'staff-1', 'c1')
    await expect(service.playerView(token)).rejects.toThrow('not available')
  })

  it('never reuses a lesson sent back in this cohort, for any learner there', async () => {
    const { service, db, claude } = setup()
    const sent = await db.lesson.create({ data: approvedLesson() })
    await db.lessonUse.create({
      data: { lessonId: sent.id, cohortId: 'c1', userId: 'learner-9', itemId: 'item-1' },
    })
    await db.lessonUse.create({
      data: { lessonId: sent.id, cohortId: 'c2', userId: 'learner-3', itemId: 'item-1' },
    })
    await service.reviewLesson(sent.id, false, 'staff-1', 'c1')
    expect(sent.status).toBe('approved') // c2 still has it
    const state = await service.makeLesson(request())
    expect(state.lessonId).not.toBe(sent.id)
    expect(claude.messages.create).toHaveBeenCalledTimes(1)
    // another cohort still reuses it
    const other = await service.makeLesson(
      request({ slot: { ...slot, cohortId: 'c3', userId: 'learner-4' } })
    )
    expect(other.lessonId).toBe(sent.id)
  })

  it('a slot whose lesson was sent back is given a new one', async () => {
    const { service, claude } = setup()
    const first = await service.makeLesson(request())
    await service.reviewLesson(first.lessonId!, false, 'staff-1', 'c1')
    const next = await service.makeLesson(request())
    expect(next.lessonId).not.toBe(first.lessonId)
    expect(next.status).toBe('ready')
    expect(claude.messages.create).toHaveBeenCalledTimes(2)
  })

  it('rejects the library row when no other cohort uses it', async () => {
    const { service, lesson } = await sharedLesson('pending')
    await service.reviewLesson(lesson.id, false, 'staff-1', 'c1')
    expect(lesson.status).toBe('pending')
    const view = await service.reviewLesson(lesson.id, false, 'staff-2', 'c2')
    expect(view.status).toBe('rejected')
    expect(lesson).toMatchObject({ status: 'rejected', reviewedBy: 'staff-2' })
  })

  it('keeps a rejected lesson rejected', async () => {
    const { service, lesson } = await sharedLesson('rejected')
    await service.reviewLesson(lesson.id, true, 'staff-1', 'c1')
    expect(lesson.status).toBe('rejected')
  })

  it('refuses a lesson that does not exist', async () => {
    const { service } = setup()
    await expect(service.reviewLesson('nope', true, 'staff-1', 'c1')).rejects.toThrow('not found')
  })
})

describe('the lesson library, for a system admin', () => {
  async function library() {
    const s = setup()
    const pending = await s.db.lesson.create({
      data: approvedLesson({ status: 'pending', reviewedBy: null }),
    })
    const shown = await s.db.lesson.create({
      data: approvedLesson({ reviewedBy: null, level: 'some SQL' }),
    })
    const reusable = await s.db.lesson.create({ data: approvedLesson() })
    const rejected = await s.db.lesson.create({ data: approvedLesson({ status: 'rejected' }) })
    for (const [cohortId, userId] of [
      ['c1', 'learner-1'],
      ['c2', 'learner-2'],
    ])
      await s.db.lessonUse.create({
        data: { lessonId: shown.id, cohortId, userId, itemId: 'item-1' },
      })
    return { ...s, pending, shown, reusable, rejected }
  }

  it('lists what needs review: pending, or shown with no person’s approval', async () => {
    const { service, pending, shown } = await library()
    const { rows, total } = await service.lessonLibrary('needs-review')
    expect(total).toBe(2)
    expect(rows.map((r) => r.id)).toEqual([shown.id, pending.id])
    expect(rows[0]).toMatchObject({ level: 'some SQL', promptVersion: 'p', reviewedBy: null })
    expect(rows[0].usedBy.map((u) => u.userId).sort()).toEqual(['learner-1', 'learner-2'])
  })

  it('lists approved for reuse, rejected, and all', async () => {
    const { service, reusable, rejected } = await library()
    expect((await service.lessonLibrary('approved')).rows.map((r) => r.id)).toEqual([reusable.id])
    expect((await service.lessonLibrary('rejected')).rows.map((r) => r.id)).toEqual([rejected.id])
    expect(await service.lessonLibrary('all')).toMatchObject({ rows: { length: 4 }, total: 4 })
  })

  it('approving for reuse sets the reviewer, and the library then reuses it', async () => {
    const { service, db, lessons } = setup()
    const first = await service.makeLesson(request({ review: true }))
    const view = await service.curateLesson(first.lessonId!, true, 'admin-1')
    expect(view).toMatchObject({ status: 'approved', reviewedBy: 'admin-1' })
    expect(view.usedBy).toHaveLength(1)
    const other = await service.makeLesson(request({ slot: { ...slot, userId: 'learner-2' } }))
    expect(other.lessonId).toBe(first.lessonId)
    expect(lessons).toHaveLength(1)
    expect(db.lesson.create).toHaveBeenCalledTimes(1)
  })

  it('rejecting takes it from every learner, who can be given a new one', async () => {
    const { service, uses } = setup()
    const first = await service.makeLesson(request())
    const view = await service.curateLesson(first.lessonId!, false, 'admin-1')
    expect(view).toMatchObject({ status: 'rejected', reviewedBy: 'admin-1' })
    expect(uses).toHaveLength(1)
    expect((await service.lessonSlot(slot)).status).toBe('rejected')
    const next = await service.makeLesson(request())
    expect(next.lessonId).not.toBe(first.lessonId)
  })

  it('refuses a lesson that does not exist', async () => {
    const { service } = setup()
    await expect(service.curateLesson('nope', true, 'admin-1')).rejects.toThrow('not found')
  })
})

describe('staff views and the demo', () => {
  it('lists lessons used in a cohort with who they were for, and how a learner watched', async () => {
    const { service } = setup()
    await service.makeLesson(request())
    await service.demoWatch(slot)
    const [content] = await service.lessonsInCohort('c1')
    expect(content).toMatchObject({
      skill: 'Joins',
      status: 'approved',
      title: 'Joining two tables',
    })
    expect(content.usedBy).toEqual([
      { userId: 'learner-1', itemId: 'item-1', at: expect.any(String) },
    ])
    const [entry] = await service.lessonHistory('c1', 'learner-1')
    expect(entry).toMatchObject({ itemId: 'item-1', watched: 'all 3 scenes · browser voice' })
    expect((await service.lessonSlot(slot)).finished).toBe(true)
  })

  it('demo watch uses the server voice where there is one', async () => {
    const { service } = setup()
    voice.canSpeak.mockReturnValue(true)
    await service.makeLesson(request())
    await service.demoWatch(slot)
    const [entry] = await service.lessonHistory('c1', 'learner-1')
    expect(entry.watched).toBe('all 3 scenes · Mac voice')
  })

  it('demo watch on a lesson waiting for review fails instead of doing nothing', async () => {
    const { service, events } = setup()
    await service.makeLesson(request({ review: true }))
    await expect(service.demoWatch(slot)).rejects.toThrow('That lesson is waiting for review')
    expect(events).toHaveLength(0)
  })

  it('demo forget drops those learners’ uses and events in the cohort, keeping the library', async () => {
    const { service, uses, events, lessons } = setup()
    await service.makeLesson(request())
    await service.makeLesson(request({ slot: { ...slot, userId: 'learner-2' } }))
    await service.demoWatch(slot)
    await service.demoForget('c1', ['learner-1'])
    expect(uses.map((u) => u.userId)).toEqual(['learner-2'])
    expect(events).toHaveLength(0)
    // each learner got a lesson of their own (neither was reviewed, so neither was reused); both stay
    expect(lessons).toHaveLength(2)
    await service.demoForget('c1', [])
    expect(uses).toHaveLength(1)
  })
})

describe('addUsage', () => {
  it('sums every count and treats missing cache counts as zero', () => {
    const zero = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
    const once = addUsage(zero, {
      input_tokens: 5,
      output_tokens: 7,
      cache_read_input_tokens: 2,
      cache_creation_input_tokens: 3,
    })
    expect(addUsage(once, { input_tokens: 1, output_tokens: 1 })).toEqual({
      inputTokens: 6,
      outputTokens: 8,
      cacheReadTokens: 2,
      cacheWriteTokens: 3,
    })
    expect(addUsage(once, null)).toEqual(once)
  })
})
