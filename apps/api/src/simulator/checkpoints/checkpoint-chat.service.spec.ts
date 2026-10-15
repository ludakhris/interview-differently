import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { CheckpointPlacement } from '../../core/practice-port'
import { CheckpointChatService, type CheckpointContext } from './checkpoint-chat.service'
import { parsePlacement, samePlacement, type SimulatorPlacement } from './checkpoint-placement'

// The chat checkpoint (issue #90): what the learner sees, what is recorded, when it is done.

const slot = { cohortId: 'k1', userId: 'u1', itemId: 'i1' }
const diagnostic: CheckpointPlacement = {
  bankSlug: 'bank',
  refs: ['1.1', '1.2'],
  title: 'First morning',
  scenario: 'Your first morning on the data team',
  diagnostic: true,
  practice: null,
}
const q = (ref: string) => ({
  ref,
  prompt: `Request ${ref}`,
  from: ref === '1.1' ? 'Dana · Support' : null,
  starterSql: null,
  referenceSql: `select '${ref}'`,
  ordered: false,
  strictColumns: false,
})
const bank = { id: 'as1', slug: 'bank', version: 'v1', setupSql: '', schema: [], index: new Map() }

function setup(events: object[] = []) {
  const prisma = {
    practiceEvent: {
      findMany: jest.fn(async (): Promise<object[]> => events),
      findFirst: jest.fn(async (): Promise<unknown> => null),
      create: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({})),
    },
    // An interactive transaction runs its callback on the same client here.
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(prisma)),
    $executeRaw: jest.fn(async () => 0),
    practiceSetUse: {
      findFirst: jest.fn(async (): Promise<unknown> => null),
      deleteMany: jest.fn(async () => ({})),
    },
    assessment: { findUnique: jest.fn(async () => ({ id: 'as1' })) },
    assessmentDelivery: {
      findUnique: jest.fn(),
      findFirst: jest.fn(async (): Promise<unknown> => null),
      create: jest.fn(async () => ({ id: 'd1' })),
      update: jest.fn(async () => ({})),
    },
  }
  const engine = {
    loadBank: jest.fn(async () => bank),
    bankQuestions: jest.fn((_: unknown, refs: string[]) => refs.map(q)),
    shapes: jest.fn(async (_: unknown, qs: unknown[]) =>
      qs.map(() => ({ columns: ['a'], rowCount: 3 }))
    ),
    grade: jest.fn(
      async (): Promise<{
        correct: boolean
        reason: string | null
        error: string | null
        preview: object | null
      }> => ({ correct: true, reason: null, error: null, preview: null })
    ),
    run: jest.fn(async () => ({ preview: null, error: null, check: null })),
    help: jest.fn(async () => ({
      kind: 'hint',
      text: 'Try WHERE.',
      exampleSql: null,
      source: 'rules',
    })),
    practiceForSlot: jest.fn(async () => ({})),
  }
  const svc = new CheckpointChatService(prisma as never, engine as never)
  return { svc, prisma, engine }
}

const ctx = (placement: SimulatorPlacement = diagnostic): CheckpointContext => ({
  slot,
  deliveryId: 'd1',
  placement,
})
const answer = (ref: string, correct: boolean, passed = false, at = 1) => ({
  kind: 'answer',
  ref,
  correct,
  passed,
  data: { sql: passed ? null : 'select 1', reason: correct ? null : 'rows differ', error: null },
  at,
})

describe('the view', () => {
  it('shows the requests with their sender and the shape of the answer, never the answer', async () => {
    const { svc } = setup()
    const v = await svc.view(ctx())
    expect(v).toMatchObject({
      deliveryId: 'd1',
      title: 'First morning',
      diagnostic: true,
      oneAnswer: true,
      done: false,
      scorePct: null,
      practice: null,
    })
    expect(v.tasks[0]).toEqual({
      ref: '1.1',
      prompt: 'Request 1.1',
      from: 'Dana · Support',
      starterSql: null,
      expected: { columns: ['a'], rowCount: 3 },
    })
    expect(JSON.stringify(v)).not.toContain('select')
  })

  it('keeps the latest answer per request, with tries and helps', async () => {
    const { svc } = setup([
      answer('1.1', false),
      { kind: 'help', ref: '1.1', data: {} },
      answer('1.1', true),
    ])
    const v = await svc.view(ctx())
    expect(v.answers['1.1']).toEqual({
      correct: true,
      passed: false,
      sql: 'select 1',
      preview: null,
      reason: null,
      error: null,
      tries: 2,
      helps: 1,
    })
    expect(v.done).toBe(false)
  })

  it('is done once every request is answered, right, wrong or passed; the score is the share right', async () => {
    const { svc } = setup([answer('1.1', true), answer('1.2', false, true)])
    const v = await svc.view(ctx())
    expect(v.done).toBe(true)
    expect(v.scorePct).toBe(50)
    expect(CheckpointChatService.progress([], {})).toEqual({ done: false, scorePct: null })
  })
})

describe('answers', () => {
  it('grades on the server and records the answer', async () => {
    const { svc, prisma, engine } = setup()
    const r = await svc.answer(ctx(), { ref: '1.1', sql: 'select 1' })
    expect(engine.grade).toHaveBeenCalledWith('bank', '1.1', 'select 1')
    expect(r.correct).toBe(true)
    expect(prisma.practiceEvent.create).toHaveBeenCalledWith({
      data: {
        ...slot,
        deliveryId: 'd1',
        kind: 'answer',
        ref: '1.1',
        correct: true,
        passed: false,
        data: { sql: 'select 1', preview: null, reason: null, error: null },
      },
    })
  })

  it("keeps the first rows of the sent query with the answer, so a reloaded chat shows the learner's table", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => [i])
    const preview = { columns: ['n'], rows, rowCount: 79 }
    const { svc, prisma, engine } = setup()
    engine.grade.mockResolvedValueOnce({
      correct: false,
      reason: 'rows differ',
      error: null,
      preview,
    })
    const r = await svc.answer(ctx(), { ref: '1.1', sql: 'select n' })
    expect(r.preview).toBe(preview)
    const call = prisma.practiceEvent.create.mock.calls[0] as unknown as [
      { data: { data: { preview: { rows: unknown[][]; rowCount: number } } } },
    ]
    expect(call[0].data.data.preview).toEqual({
      columns: ['n'],
      rows: rows.slice(0, 10),
      rowCount: 79,
    })
    // read back as the answer's state; a pass or an old event without one has none
    const back = setup([
      { ...answer('1.1', false), data: { sql: 'select n', preview: call[0].data.data.preview } },
      answer('1.2', false, true),
    ])
    const v = await back.svc.view(ctx())
    expect(v.answers['1.1']!.preview).toEqual({
      columns: ['n'],
      rows: rows.slice(0, 10),
      rowCount: 79,
    })
    expect(v.answers['1.2']!.preview).toBeNull()
  })

  it('records a pass in a diagnostic, without grading', async () => {
    const { svc, prisma, engine } = setup()
    await svc.answer(ctx(), { ref: '1.2', pass: true })
    expect(engine.grade).not.toHaveBeenCalled()
    expect(prisma.practiceEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ref: '1.2', correct: false, passed: true }),
    })
  })

  it('in a diagnostic, an answered request (right, wrong or passed) cannot be answered again', async () => {
    for (const prior of [answer('1.1', true), answer('1.1', false), answer('1.1', false, true)]) {
      const { svc, prisma, engine } = setup([prior])
      await expect(svc.answer(ctx(), { ref: '1.1', sql: 'select 1' })).rejects.toThrow(
        ConflictException
      )
      await expect(svc.answer(ctx(), { ref: '1.1', pass: true })).rejects.toThrow(
        'You have answered this one'
      )
      expect(engine.grade).not.toHaveBeenCalled()
      expect(prisma.practiceEvent.create).not.toHaveBeenCalled()
    }
  })

  it('where one answer applies, records it under a lock on the request, re-checked after grading', async () => {
    const sim = { ...diagnostic, diagnostic: false, oneAnswer: true as const }
    for (const placement of [diagnostic, sim]) {
      const { svc, prisma } = setup()
      await svc.answer(ctx(placement), { ref: '1.1', sql: 'select 1' })
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      // a parameterized tagged template: the key is a bound value, never part of the SQL text
      const [strings, ...values] = prisma.$executeRaw.mock.calls[0] as unknown as [
        TemplateStringsArray,
        ...unknown[],
      ]
      expect(strings.join('?')).toBe('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))')
      expect(values).toEqual([expect.stringContaining('k1\u0001u1\u0001i1\u00011.1')])
      expect(prisma.practiceEvent.findFirst).toHaveBeenCalledWith({
        where: { cohortId: 'k1', userId: 'u1', itemId: 'i1', ref: '1.1', kind: 'answer' },
        select: { id: true },
      })
      expect(prisma.practiceEvent.create).toHaveBeenCalledTimes(1)
    }
  })

  it('where one answer applies, a second send that loses the race is refused and not recorded', async () => {
    const { svc, prisma, engine } = setup()
    // nothing was answered when this send arrived, but another got recorded while it was graded
    prisma.practiceEvent.findFirst.mockResolvedValueOnce({ id: 'e-first' })
    await expect(svc.answer(ctx(), { ref: '1.1', sql: 'select 1' })).rejects.toThrow(
      ConflictException
    )
    expect(engine.grade).toHaveBeenCalledTimes(1)
    expect(prisma.practiceEvent.create).not.toHaveBeenCalled()
  })

  it('a regular checkpoint keeps retries', async () => {
    const { svc, prisma } = setup([answer('1.1', false)])
    await svc.answer(ctx({ ...diagnostic, diagnostic: false }), { ref: '1.1', sql: 'select 1' })
    expect(prisma.practiceEvent.create).toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect((await svc.view(ctx({ ...diagnostic, diagnostic: false }))).oneAnswer).toBe(false)
  })

  it('a work simulation (oneAnswer) takes one answer per request, with no pass, and says so in the view', async () => {
    const sim = { ...diagnostic, diagnostic: false, oneAnswer: true as const }
    for (const prior of [answer('1.1', true), answer('1.1', false)]) {
      const { svc, prisma, engine } = setup([prior])
      await expect(svc.answer(ctx(sim), { ref: '1.1', sql: 'select 1' })).rejects.toThrow(
        'You have answered this one'
      )
      expect(engine.grade).not.toHaveBeenCalled()
      expect(prisma.practiceEvent.create).not.toHaveBeenCalled()
    }
    const { svc, prisma } = setup()
    const r = await svc.answer(ctx(sim), { ref: '1.1', sql: 'select 1' })
    expect(prisma.practiceEvent.create).toHaveBeenCalledTimes(1)
    expect(r.view).toMatchObject({ diagnostic: false, oneAnswer: true })
    await expect(svc.answer(ctx(sim), { ref: '1.2', pass: true })).rejects.toThrow(
      BadRequestException
    )
  })

  it('a practice slot keeps retries, whatever its flags say', async () => {
    const slotCtx = ctx({
      ...diagnostic,
      oneAnswer: true,
      refs: [],
      practice: { skill: 'Joins', evidenceRefs: ['1.1'], review: false },
    })
    const { svc } = setup()
    expect((await svc.view(slotCtx)).oneAnswer).toBe(false)
  })

  it('a dry run in a diagnostic never checks against the answer key; elsewhere it does', async () => {
    const { svc, engine } = setup()
    await svc.run(ctx(), { ref: '1.1', sql: 'select 1' })
    expect(engine.run).toHaveBeenLastCalledWith('bank', 'select 1')
    await svc.run(ctx({ ...diagnostic, diagnostic: false }), { ref: '1.1', sql: 'select 1' })
    expect(engine.run).toHaveBeenLastCalledWith('bank', 'select 1', '1.1')
    // the ref is still checked: a request the learner was not given is refused
    await expect(svc.run(ctx(), { ref: '9.9', sql: 'select 1' })).rejects.toThrow(NotFoundException)
  })

  it('refuses a pass outside a diagnostic', async () => {
    const { svc, prisma } = setup()
    await expect(
      svc.answer(ctx({ ...diagnostic, diagnostic: false }), { ref: '1.1', pass: true })
    ).rejects.toThrow(BadRequestException)
    expect(prisma.practiceEvent.create).not.toHaveBeenCalled()
  })

  it('refuses a request the learner was not given, a missing query and an oversized one', async () => {
    const { svc } = setup()
    await expect(svc.answer(ctx(), { ref: '9.9', sql: 'select 1' })).rejects.toThrow(
      NotFoundException
    )
    await expect(svc.run(ctx(), { ref: '9.9', sql: 'select 1' })).rejects.toThrow(NotFoundException)
    await expect(svc.answer(ctx(), { ref: '1.1' })).rejects.toThrow(BadRequestException)
    await expect(svc.answer(ctx(), { ref: '1.1', sql: 'x'.repeat(20_001) })).rejects.toThrow(
      BadRequestException
    )
  })

  it('records help with what was said', async () => {
    const { svc, prisma } = setup()
    await svc.help(ctx(), { ref: '1.1', sql: '', kind: 'hint' })
    expect(prisma.practiceEvent.create).toHaveBeenCalledWith({
      data: {
        ...slot,
        deliveryId: 'd1',
        kind: 'help',
        ref: '1.1',
        data: { kind: 'hint', text: 'Try WHERE.', exampleSql: null, source: 'rules' },
      },
    })
    await expect(svc.help(ctx(), { ref: '1.1', sql: '', kind: 'answer' })).rejects.toThrow(
      BadRequestException
    )
  })

  it('where one answer applies, coaching never grades the draft: it coaches on the request only', async () => {
    const sim = { ...diagnostic, diagnostic: false, oneAnswer: true as const }
    for (const placement of [diagnostic, sim]) {
      const { svc, engine } = setup()
      await svc.help(ctx(placement), { ref: '1.1', sql: 'select right_answer', kind: 'hint' })
      expect(engine.help).toHaveBeenLastCalledWith(expect.objectContaining({ ref: '1.1', sql: '' }))
    }
    // elsewhere the draft is part of the coaching
    const { svc, engine } = setup()
    await svc.help(ctx({ ...diagnostic, diagnostic: false }), {
      ref: '1.1',
      sql: 'select draft',
      kind: 'hint',
    })
    expect(engine.help).toHaveBeenLastCalledWith(expect.objectContaining({ sql: 'select draft' }))
  })
})

describe('a practice slot', () => {
  const practice: CheckpointPlacement = {
    ...diagnostic,
    refs: [],
    diagnostic: false,
    practice: { skill: 'Filter rows', evidenceRefs: ['1.1'], review: true },
  }

  it('is "writing" until practice is made, and has nothing to answer until it is approved', async () => {
    const { svc, prisma } = setup()
    expect((await svc.view(ctx(practice))).practice).toEqual({
      status: 'writing',
      skill: 'Filter rows',
      intro: null,
    })
    prisma.practiceSetUse.findFirst.mockResolvedValue({
      practiceSet: {
        id: 'p1',
        status: 'pending',
        intro: 'Hi',
        tasks: [{ prompt: 'a', referenceSql: 's' }],
      },
    })
    const pending = await svc.view(ctx(practice))
    expect(pending.practice?.status).toBe('pending')
    expect(pending.tasks).toEqual([])
    prisma.practiceSetUse.findFirst.mockResolvedValue({
      practiceSet: {
        id: 'p1',
        status: 'approved',
        intro: 'Hi',
        tasks: [{ prompt: 'a', referenceSql: 's' }],
      },
    })
    const ready = await svc.view(ctx(practice))
    expect(ready.practice?.status).toBe('ready')
    expect(ready.tasks.map((t) => t.ref)).toEqual(['gen:p1:0'])
    // course staff sent it back: the slot needs another set
    prisma.practiceSetUse.findFirst.mockResolvedValue({
      sentBackAt: new Date(),
      practiceSet: {
        id: 'p1',
        status: 'approved',
        intro: 'Hi',
        tasks: [{ prompt: 'a', referenceSql: 's' }],
      },
    })
    const sentBack = await svc.view(ctx(practice))
    expect(sentBack.practice?.status).toBe('writing')
    expect(sentBack.tasks).toEqual([])
  })

  it("makes practice aimed at the learner's misses, and keeps live practice it already has", async () => {
    const { svc, prisma, engine } = setup([
      { ref: '1.1', data: { sql: 'select *', reason: 'expected 4 row(s), got 79' } },
    ])
    await svc.practice(ctx(practice))
    const [s, p, misses] = engine.practiceForSlot.mock.calls[0] as unknown as [
      unknown,
      unknown,
      () => Promise<unknown>,
    ]
    expect(s).toEqual(slot)
    expect(p).toEqual({ bankSlug: 'bank', skill: 'Filter rows', review: true })
    expect(await misses()).toEqual([
      { prompt: 'Request 1.1', sql: 'select *', reason: 'expected 4 row(s), got 79' },
    ])
    expect(prisma.practiceEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cohortId: 'k1',
          userId: 'u1',
          kind: 'answer',
          correct: false,
          passed: false,
          ref: { in: ['1.1'] },
        },
      })
    )
    engine.practiceForSlot.mockClear()
    // two requests at once write one set: the second waits for the first, slot check included
    let finish: () => void = () => undefined
    engine.practiceForSlot.mockImplementationOnce(
      () => new Promise((r) => (finish = () => r({}))) as never
    )
    const both = Promise.all([svc.practice(ctx(practice)), svc.practice(ctx(practice))])
    await new Promise((r) => setImmediate(r))
    finish()
    await both
    expect(engine.practiceForSlot).toHaveBeenCalledTimes(1)
    engine.practiceForSlot.mockClear()
    prisma.practiceSetUse.findFirst.mockResolvedValue({
      practiceSet: { id: 'p1', status: 'pending', intro: '', tasks: [] },
    })
    await svc.practice(ctx(practice))
    expect(engine.practiceForSlot).not.toHaveBeenCalled()
    // a set sent back is replaced
    prisma.practiceSetUse.findFirst.mockResolvedValue({
      sentBackAt: new Date(),
      practiceSet: { id: 'p1', status: 'approved', intro: '', tasks: [] },
    })
    await svc.practice(ctx(practice))
    expect(engine.practiceForSlot).toHaveBeenCalledTimes(1)
    await expect(svc.practice(ctx())).rejects.toThrow(BadRequestException)
  })
})

describe('the delivery', () => {
  it('refuses a delivery made to another cohort, or with no placement', async () => {
    const { svc, prisma } = setup()
    prisma.assessmentDelivery.findUnique.mockResolvedValue({
      id: 'd1',
      cohortId: 'other',
      config: diagnostic,
      assessment: { slug: 'bank' },
    })
    await expect(svc.contextOf('d1', 'k1', 'u1', 'i1')).rejects.toThrow(NotFoundException)
    prisma.assessmentDelivery.findUnique.mockResolvedValue({
      id: 'd1',
      cohortId: 'k1',
      config: null,
      assessment: { slug: 'bank' },
    })
    await expect(svc.contextOf('d1', 'k1', 'u1', 'i1')).rejects.toThrow(NotFoundException)
    prisma.assessmentDelivery.findUnique.mockResolvedValue({
      id: 'd1',
      cohortId: 'k1',
      config: diagnostic,
      assessment: { slug: 'bank' },
    })
    await expect(svc.contextOf('d1', 'k1', 'u1', 'i1')).resolves.toEqual({
      slot,
      deliveryId: 'd1',
      placement: diagnostic,
    })
  })
})

describe('the demo autoplay (PracticePort)', () => {
  it('records on the same delivery an LTI launch would use, and returns done and the score', async () => {
    const checkpoint = { ...diagnostic, diagnostic: false }
    const { svc, prisma } = setup([answer('1.1', true), answer('1.2', true)])
    const out = await svc.demoAnswer(slot, checkpoint, { ref: '1.1', sql: 'select 1' })
    expect(prisma.assessmentDelivery.create).toHaveBeenCalledWith({
      data: { assessmentId: 'as1', cohortId: 'k1', label: 'lti:i1', config: checkpoint },
      select: { id: true },
    })
    expect(out).toEqual({ correct: true, done: true, scorePct: 100 })
  })

  it('refuses a placement naming a request its bank does not have, before anything is made', async () => {
    const { svc, prisma, engine } = setup()
    engine.bankQuestions.mockImplementation((_: unknown, refs: string[]) =>
      refs.filter((r) => r !== '9.9').map(q)
    )
    const bad = { ...diagnostic, refs: ['1.1', '9.9'] }
    await expect(svc.demoAnswer(slot, bad, { ref: '1.1', sql: 'select 1' })).rejects.toThrow(
      ConflictException
    )
    await expect(svc.demoHelp(slot, bad, { ref: '1.1', sql: '', kind: 'hint' })).rejects.toThrow(
      'question bank does not have'
    )
    expect(prisma.assessmentDelivery.create).not.toHaveBeenCalled()
    expect(prisma.practiceEvent.create).not.toHaveBeenCalled()
  })

  it('keeps the stored placement in step with the course', async () => {
    const { svc, prisma } = setup()
    prisma.assessmentDelivery.findFirst.mockResolvedValue({
      id: 'd7',
      config: { ...diagnostic, refs: ['1.1'] },
    })
    await svc.demoAnswer(slot, diagnostic, { ref: '1.2', pass: true })
    expect(prisma.assessmentDelivery.update).toHaveBeenCalledWith({
      where: { id: 'd7' },
      data: { config: diagnostic },
    })
    expect(prisma.practiceEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ deliveryId: 'd7', passed: true }),
    })
  })

  it("forgets demo learners' answers, help and practice uses in the cohort, not the library", async () => {
    const { svc, prisma } = setup()
    await svc.demoForget('k1', ['u1', 'u2'])
    const where = { cohortId: 'k1', userId: { in: ['u1', 'u2'] } }
    expect(prisma.practiceEvent.deleteMany).toHaveBeenCalledWith({ where })
    expect(prisma.practiceSetUse.deleteMany).toHaveBeenCalledWith({ where })
    prisma.practiceEvent.deleteMany.mockClear()
    await svc.demoForget('k1', [])
    expect(prisma.practiceEvent.deleteMany).not.toHaveBeenCalled()
  })
})

describe('parsePlacement', () => {
  it('reads a placement from JSON or an object, and refuses anything off', () => {
    expect(parsePlacement(JSON.stringify(diagnostic))).toEqual(diagnostic)
    expect(parsePlacement(diagnostic)).toEqual(diagnostic)
    for (const bad of [
      null,
      '{',
      { ...diagnostic, refs: [] }, // nothing to ask and no practice
      { ...diagnostic, refs: [1] },
      { ...diagnostic, diagnostic: 'yes' },
      { ...diagnostic, bankSlug: '' },
      { ...diagnostic, practice: { skill: 'x', evidenceRefs: 'a', review: true } },
      { ...diagnostic, refs: Array.from({ length: 51 }, (_, i) => `${i}`) },
      { ...diagnostic, oneAnswer: 'yes' },
    ])
      expect(parsePlacement(bad)).toBeNull()
  })

  it('keeps oneAnswer only when it is set, so a placement without it reads back unchanged', () => {
    const sim = { ...diagnostic, diagnostic: false, oneAnswer: true as const }
    expect(parsePlacement(JSON.stringify(sim))).toEqual(sim)
    expect(parsePlacement({ ...diagnostic, oneAnswer: false })).toEqual(diagnostic)
    expect(samePlacement(sim, sim)).toBe(true)
    expect(samePlacement(diagnostic, diagnostic)).toBe(true)
    // a stored placement from before the flag is not the same: the delivery's config is brought up to date
    expect(samePlacement({ ...sim, oneAnswer: undefined }, sim)).toBe(false)
    expect(samePlacement(sim, diagnostic)).toBe(false)
  })
})
