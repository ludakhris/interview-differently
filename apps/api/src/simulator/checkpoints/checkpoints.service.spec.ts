import { CheckpointsService, addUsage } from './checkpoints.service'
import { PRACTICE_PROMPT_VERSION } from './coach'

// The practice library: reuse what a person approved, else write (and account for) new practice. Issue #90.

const slot = { cohortId: 'k1', userId: 'u1', itemId: 'i9' }
const bankRow = {
  id: 'as1',
  slug: 'bank',
  updatedAt: new Date('2026-10-14T09:00:00Z'),
  sections: [
    {
      id: 's1',
      questions: [
        {
          id: '1.1',
          type: 'sql',
          prompt: 'Customers in Ohio',
          referenceSql: 'select key',
          ordered: false,
          strictColumns: false,
        },
      ],
    },
  ],
  dataset: { setupSql: 'create table t()', schemaSummary: [] },
}
const ok = (rowCount = 2) => ({
  ok: true,
  result: { columns: ['a'], rows: [] as unknown[][], rowCount, truncated: false },
})
const draft = (tasks: { prompt: string; referenceSql: string }[]) => ({
  model: 'claude-sonnet-5-5-20261001',
  stop_reason: 'end_turn',
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        intro: 'You mix up WHERE and HAVING.',
        tasks: tasks.map((t) => ({ ...t, ordered: false })),
      }),
    },
  ],
})

const libraryRow = {
  id: 'p1',
  bankSlug: 'bank',
  skill: 'Filter rows',
  status: 'pending',
  intro: 'Hi',
  tasks: [{ prompt: 'a', referenceSql: 'select 1', ordered: false }],
  model: 'm',
  createdAt: new Date('2026-10-14T09:00:00Z'),
  reviewedAt: null,
  reviewedBy: null,
  promptVersion: 'v1',
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 0,
  cacheWriteTokens: null,
}

function setup() {
  const prisma = {
    assessment: { findUnique: jest.fn(async () => bankRow) },
    practiceSet: {
      findFirst: jest.fn(async (): Promise<unknown> => null),
      findUnique: jest.fn(async (): Promise<unknown> => null),
      create: jest.fn(async ({ data }: { data: object }) => ({ id: 'p-new', ...data })),
      update: jest.fn(async ({ data }: { data: object }) => ({ ...libraryRow, ...data })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async (): Promise<unknown[]> => []),
      count: jest.fn(async (): Promise<number> => 0),
    },
    practiceSetUse: {
      create: jest.fn(async () => ({})),
      count: jest.fn(async (): Promise<number> => 0),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async (): Promise<unknown[]> => []),
    },
  }
  const runner = { executeMany: jest.fn(async (_: string, sqls: string[]) => sqls.map(() => ok())) }
  const svc = new CheckpointsService(prisma as never, runner as never)
  const create = jest.fn()
  ;(svc as unknown as { client: unknown }).client = { messages: { create } }
  return { svc, prisma, runner, create }
}

describe('practice for a slot', () => {
  it('reuses a set a person approved that this learner has not had in this cohort, writing nothing', async () => {
    const h = setup()
    h.prisma.practiceSet.findFirst.mockResolvedValue({ id: 'p-old', status: 'approved' })
    const misses = jest.fn(async () => [])
    const set = await h.svc.practiceForSlot(
      slot,
      { bankSlug: 'bank', skill: 'Filter rows', review: true },
      misses
    )
    expect(set.id).toBe('p-old')
    expect(h.prisma.practiceSet.findFirst).toHaveBeenCalledWith({
      where: {
        bankSlug: 'bank',
        skill: 'Filter rows',
        status: 'approved',
        reviewedBy: { not: null },
        // not one this learner had here, and not one sent back in this cohort
        uses: {
          none: { cohortId: 'k1', OR: [{ userId: 'u1' }, { sentBackAt: { not: null } }] },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    expect(h.create).not.toHaveBeenCalled()
    expect(misses).not.toHaveBeenCalled()
    expect(h.prisma.practiceSet.create).not.toHaveBeenCalled()
    expect(h.prisma.practiceSetUse.create).toHaveBeenCalledWith({
      data: { practiceSetId: 'p-old', cohortId: 'k1', userId: 'u1', itemId: 'i9' },
    })
  })

  it('writes a new set when none can be reused: held for review, or approved without one', async () => {
    for (const [review, status] of [
      [true, 'pending'],
      [false, 'approved'],
    ] as const) {
      const h = setup()
      h.create.mockResolvedValue({
        ...draft([
          { prompt: 'a', referenceSql: 'select 1' },
          { prompt: 'b', referenceSql: 'select 2' },
        ]),
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      const misses = jest.fn(async () => [{ prompt: 'Q', sql: 'select', reason: 'rows differ' }])
      await h.svc.practiceForSlot(slot, { bankSlug: 'bank', skill: 'Filter rows', review }, misses)
      expect(misses).toHaveBeenCalled()
      expect(h.prisma.practiceSet.create.mock.calls[0][0].data).toMatchObject({
        bankSlug: 'bank',
        skill: 'Filter rows',
        status,
      })
      expect(h.prisma.practiceSetUse.create).toHaveBeenCalledWith({
        data: { practiceSetId: 'p-new', cohortId: 'k1', userId: 'u1', itemId: 'i9' },
      })
    }
  })
})

describe('writing practice', () => {
  it('sums the tokens of every draft call and keeps the model and prompt version', async () => {
    const h = setup()
    // the first draft has one key that returns no rows; the second fills the set
    h.create
      .mockResolvedValueOnce({
        ...draft([
          { prompt: 'a', referenceSql: 'select 1' },
          { prompt: 'b', referenceSql: 'select none' },
        ]),
        usage: {
          input_tokens: 100,
          output_tokens: 40,
          cache_read_input_tokens: 7,
          cache_creation_input_tokens: 3,
        },
      })
      .mockResolvedValueOnce({
        ...draft([{ prompt: 'c', referenceSql: 'select 3' }]),
        usage: {
          input_tokens: 120,
          output_tokens: 50,
          cache_read_input_tokens: null,
          cache_creation_input_tokens: 2,
        },
      })
    h.runner.executeMany.mockImplementation(async (_: string, sqls: string[]) =>
      sqls.map((s) => ok(s === 'select none' ? 0 : 2))
    )
    await h.svc.writePractice({
      bankSlug: 'bank',
      skill: 'Filter rows',
      misses: [],
      status: 'pending',
    })
    expect(h.create).toHaveBeenCalledTimes(2)
    const data = h.prisma.practiceSet.create.mock.calls[0][0].data as Record<string, unknown>
    expect(data).toMatchObject({
      model: 'claude-sonnet-5-5-20261001',
      promptVersion: PRACTICE_PROMPT_VERSION,
      inputTokens: 220,
      outputTokens: 90,
      cacheReadTokens: 7,
      cacheWriteTokens: 5,
      intro: 'You mix up WHERE and HAVING.',
    })
    // only tasks whose answer key ran and returned rows are kept
    expect((data.tasks as { prompt: string }[]).map((t) => t.prompt)).toEqual(['a', 'c'])
  })

  it('counts tokens even for a draft it could not use', () => {
    expect(
      addUsage(
        { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 },
        { input_tokens: 10, output_tokens: 20 }
      )
    ).toEqual({ inputTokens: 11, outputTokens: 22, cacheReadTokens: 3, cacheWriteTokens: 4 })
  })
})

describe('coaching', () => {
  const rows = (v: number) => ({
    ok: true,
    result: { columns: ['n'], rows: [[v]], rowCount: 1, truncated: false },
  })
  const reply = (exampleSql: string) => ({
    model: 'claude-haiku-5-5',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify({ text: 'Filter with WHERE.', exampleSql }) }],
  })
  const ask = (h: ReturnType<typeof setup>) =>
    h.svc.help({ bankSlug: 'bank', ref: '1.1', sql: '', kind: 'example', skillLabel: 'Filter' })

  function withData(h: ReturnType<typeof setup>) {
    // the answer key returns 1; a reworded answer returns 1 too; another question returns 2
    h.runner.executeMany.mockImplementation(async (_: string, sqls: string[]) =>
      sqls.map((s) => rows(s === 'select other' ? 2 : 1))
    )
  }

  it('drops an example whose result is the answer key, even reworded, and runs the key first', async () => {
    const h = setup()
    withData(h)
    h.create.mockResolvedValue(reply('SELECT key AS answer'))
    const out = await ask(h)
    expect(out).toMatchObject({ exampleSql: null, source: 'rules' })
    expect(h.runner.executeMany).toHaveBeenLastCalledWith('create table t()', [
      'select key',
      'SELECT key AS answer',
    ])
  })

  it('keeps an example on another question', async () => {
    const h = setup()
    withData(h)
    h.create.mockResolvedValue(reply('select other'))
    expect(await ask(h)).toMatchObject({
      text: 'Filter with WHERE.',
      exampleSql: 'select other',
      source: 'claude-haiku-5-5',
    })
  })

  it('drops the example when it cannot be checked', async () => {
    const h = setup()
    h.create.mockResolvedValue(reply('select other'))
    h.runner.executeMany.mockRejectedValue(new Error('busy'))
    expect(await ask(h)).toMatchObject({ exampleSql: null, source: 'rules' })
  })
})

describe('reviewing practice, for one cohort', () => {
  const use = (cohortId: string, userId: string) => ({
    practiceSetId: 'p1',
    cohortId,
    userId,
    itemId: 'i1',
    createdAt: new Date('2026-10-14T10:00:00Z'),
  })

  it('refuses practice this cohort never used (or already sent back)', async () => {
    const h = setup()
    h.prisma.practiceSet.findUnique.mockResolvedValue(libraryRow)
    h.prisma.practiceSetUse.count.mockResolvedValue(0)
    await expect(h.svc.review('p1', true, 'staff', 'k1')).rejects.toThrow('Practice not found')
    expect(h.prisma.practiceSetUse.count).toHaveBeenCalledWith({
      where: { practiceSetId: 'p1', cohortId: 'k1', sentBackAt: null },
    })
    expect(h.prisma.practiceSet.updateMany).not.toHaveBeenCalled()
  })

  it("approving approves a pending library row, and the view lists this cohort's uses only", async () => {
    const h = setup()
    h.prisma.practiceSet.findUnique.mockResolvedValue(libraryRow)
    h.prisma.practiceSetUse.count.mockResolvedValue(1)
    h.prisma.practiceSetUse.findMany.mockResolvedValue([use('k1', 'u1')])
    const v = await h.svc.review('p1', true, 'staff', 'k1')
    expect(h.prisma.practiceSet.updateMany).toHaveBeenCalledWith({
      // pending, or shown without review and not yet approved by a person
      where: { id: 'p1', OR: [{ status: 'pending' }, { status: 'approved', reviewedBy: null }] },
      data: expect.objectContaining({ status: 'approved', reviewedBy: 'staff' }),
    })
    expect(h.prisma.practiceSetUse.findMany).toHaveBeenCalledWith({
      where: { practiceSetId: 'p1', cohortId: 'k1', sentBackAt: null },
      orderBy: { createdAt: 'asc' },
    })
    expect(v.usedBy.map((u) => u.userId)).toEqual(['u1'])
    expect(h.prisma.practiceSetUse.deleteMany).not.toHaveBeenCalled()
  })

  it("sending back marks this cohort's uses (keeping them) and keeps it for another cohort", async () => {
    const h = setup()
    h.prisma.practiceSet.findUnique.mockResolvedValue({ ...libraryRow, status: 'approved' })
    h.prisma.practiceSetUse.count
      .mockResolvedValueOnce(2) // used here
      .mockResolvedValueOnce(1) // and live in another cohort
    const v = await h.svc.review('p1', false, 'staff', 'k1')
    expect(h.prisma.practiceSetUse.deleteMany).not.toHaveBeenCalled()
    expect(h.prisma.practiceSetUse.updateMany).toHaveBeenCalledWith({
      where: { practiceSetId: 'p1', cohortId: 'k1', sentBackAt: null },
      data: { sentBackAt: expect.any(Date) },
    })
    // another cohort's uses count only when they were not sent back there too
    expect(h.prisma.practiceSetUse.count).toHaveBeenLastCalledWith({
      where: { practiceSetId: 'p1', cohortId: { not: 'k1' }, sentBackAt: null },
    })
    expect(h.prisma.practiceSet.update).not.toHaveBeenCalled()
    expect(v.status).toBe('approved')
  })

  it('sending back rejects the library row when no other cohort uses it', async () => {
    const h = setup()
    h.prisma.practiceSet.findUnique.mockResolvedValue(libraryRow)
    h.prisma.practiceSetUse.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0)
    const v = await h.svc.review('p1', false, 'staff', 'k1')
    expect(h.prisma.practiceSet.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ status: 'rejected', reviewedBy: 'staff' }),
    })
    expect(v.status).toBe('rejected')
  })
})

describe('the library, for a system admin', () => {
  const use = (cohortId: string, userId: string) => ({
    practiceSetId: 'p1',
    cohortId,
    userId,
    itemId: 'i1',
    createdAt: new Date('2026-10-14T10:00:00Z'),
  })

  it.each([
    ['needs-review', { OR: [{ status: 'pending' }, { status: 'approved', reviewedBy: null }] }],
    ['approved', { status: 'approved', reviewedBy: { not: null } }],
    ['rejected', { status: 'rejected' }],
    ['all', {}],
  ] as const)('lists %s rows newest first, with uses in every cohort', async (filter, where) => {
    const h = setup()
    h.prisma.practiceSet.findMany.mockResolvedValue([
      { ...libraryRow, uses: [use('k1', 'u1'), use('k2', 'u2')] },
    ])
    h.prisma.practiceSet.count.mockResolvedValue(250)
    const {
      rows: [v],
      total,
    } = await h.svc.library(filter)
    expect(h.prisma.practiceSet.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, orderBy: { createdAt: 'desc' }, take: 200 })
    )
    // the total counts every matching row, past the 200 listed
    expect(h.prisma.practiceSet.count).toHaveBeenCalledWith({ where })
    expect(total).toBe(250)
    expect(v.usedBy.map((u) => u.userId)).toEqual(['u1', 'u2'])
    expect(v).toMatchObject({
      promptVersion: 'v1',
      tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: null },
      reviewedBy: null,
    })
  })

  it('approving for reuse sets the status and the reviewer', async () => {
    const h = setup()
    h.prisma.practiceSet.findUnique.mockResolvedValue({ ...libraryRow, status: 'approved' })
    h.prisma.practiceSet.update.mockImplementation(async ({ data }: { data: object }) => ({
      ...libraryRow,
      ...data,
      uses: [use('k1', 'u1')],
    }))
    const v = await h.svc.curate('p1', true, 'admin')
    expect(h.prisma.practiceSet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({ status: 'approved', reviewedBy: 'admin' }),
      })
    )
    expect(v).toMatchObject({ status: 'approved', reviewedBy: 'admin' })
    expect(h.prisma.practiceSetUse.deleteMany).not.toHaveBeenCalled()
  })

  it('rejecting sets the status and the reviewer and keeps the uses as the record', async () => {
    const h = setup()
    h.prisma.practiceSet.findUnique.mockResolvedValue(libraryRow)
    h.prisma.practiceSet.update.mockImplementation(async ({ data }: { data: object }) => ({
      ...libraryRow,
      ...data,
      uses: [],
    }))
    const v = await h.svc.curate('p1', false, 'admin')
    expect(v).toMatchObject({ status: 'rejected', reviewedBy: 'admin' })
    expect(h.prisma.practiceSetUse.deleteMany).not.toHaveBeenCalled()
  })

  it('refuses practice that does not exist', async () => {
    const h = setup()
    await expect(h.svc.curate('nope', true, 'admin')).rejects.toThrow('Practice not found')
    expect(h.prisma.practiceSet.update).not.toHaveBeenCalled()
  })
})
