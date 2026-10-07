import { MemoryLtiStore } from '../lti-store'
import { LtiError } from '../lti-spec'
import type { LtiSession } from './lti-session'
import { LtiPlayService } from './lti-play.service'

/**
 * The server side of a launched text simulation: it holds the answer key, grades each answer,
 * remembers the play and decides the score. These tests drive it the way the player does.
 */

const band = { min: 80, max: 120, idealMin: 95, idealMax: 105 }

const data = {
  title: 'Ops decision',
  track: 'ops',
  rubric: {
    dimensions: [
      { name: 'Judgment' },
      { name: 'Quantitative Accuracy' },
      { name: 'Technical Accuracy' },
    ],
  },
  nodes: [
    {
      nodeId: 'd1',
      type: 'decision',
      choices: [
        {
          id: 'A',
          nextNodeId: 't1',
          qualitySignals: [{ dimension: 'Judgment', quality: 'strong' }],
        },
        {
          id: 'B',
          nextNodeId: 't1',
          qualitySignals: [{ dimension: 'Judgment', quality: 'developing' }],
        },
      ],
    },
    { nodeId: 't1', type: 'transition', nextNodeId: 'q1' },
    {
      nodeId: 'q1',
      type: 'quant',
      nextNodeId: 'q2',
      quant: {
        variant: 'numeric-range',
        hint: 'multiply',
        hintFootnote: 'glossary',
        field: { id: 'f', acceptedRange: band, modelAnswer: 100, derivation: 'because' },
      },
    },
    {
      nodeId: 'q2',
      type: 'quant',
      nextNodeId: 's1',
      quant: {
        variant: 'structured-quant',
        fields: [
          { id: 'a', acceptedRange: band, modelAnswer: 100 },
          { id: 'b', acceptedRange: { min: 1, max: 2 }, modelAnswer: 1.5 },
        ],
      },
    },
    {
      nodeId: 's1',
      type: 'sql',
      nextNodeId: 'end',
      sql: {
        datasetSlug: 'sql-fundamentals',
        referenceSql: 'select 1',
        hint: 'group by',
        ordered: false,
      },
    },
    { nodeId: 'end', type: 'feedback' },
  ],
}

const session: LtiSession = {
  sub: 'u1',
  ref: 'ops-001',
  lineitem: 'http://lms/lineitem',
  jti: 'j1',
  iat: Math.floor(Date.now() / 1000) - 10,
  exp: Math.floor(Date.now() / 1000) + 3600,
}

type Outcome = { ok: true; result: object } | { ok: false; error: string }
const rows = (r: unknown[][]): Outcome => ({
  ok: true,
  result: { columns: ['x'], rows: r, rowCount: r.length, command: 'SELECT' },
})

function setup(over: { scenario?: object | null; store?: MemoryLtiStore } = {}) {
  const store = over.store ?? new MemoryLtiStore()
  type Row = Record<string, unknown> & {
    dimensionScores: { create: { dimension: string; score: number }[] }
    overallScore: number
    id: string
  }
  const created: { data: Row }[] = []
  const prisma = {
    scenario: {
      findUnique: jest.fn(async () =>
        over.scenario === null
          ? null
          : { scenarioId: 'ops-001', status: 'published', data: over.scenario ?? data }
      ),
    },
    dataset: { findUnique: jest.fn(async () => ({ setupSql: 'create table t(x int);' })) },
    simulationResult: {
      create: jest.fn(async (a: { data: Row }) => {
        created.push(a)
        return a.data
      }),
    },
  }
  const runner = {
    executeMany: jest.fn(async (): Promise<Outcome[]> => [rows([[1]]), rows([[1]])]),
  }
  const tool = {
    complete: jest.fn<Promise<{ score: number; returnUrl: string }>, [LtiSession, string]>(
      async () => ({ score: 80, returnUrl: 'http://learn/back' })
    ),
  }
  const make = () => new LtiPlayService(prisma as never, runner as never, tool as never, store)
  const svc = make()
  svc.sleep = async () => undefined
  return { svc, make, store, prisma, runner, tool, created }
}

/** Plays the first decision, both quant nodes and the SQL node, returning the service. */
async function playAll(h: ReturnType<typeof setup>, o: { choice?: string; q1?: number } = {}) {
  await h.svc.choose(session, 'd1', o.choice ?? 'A')
  await h.svc.grantQuant(session, 'q1', { value: o.q1 ?? 100 })
  await h.svc.grantQuant(session, 'q2', { fields: { a: 100, b: 1.5 } })
  return h.svc.gradeSql(session, 's1', 'select 1')
}

const fails = (p: Promise<unknown>, status: number) =>
  expect(p).rejects.toMatchObject({ status, constructor: LtiError })

// Postgres jsonb keeps object keys shorter-first, then bytewise, not in insertion order
class JsonbStore extends MemoryLtiStore {
  async peek<T = unknown>(scope: string, key: string) {
    const v = await super.peek<T>(scope, key)
    const sort = (x: unknown): unknown =>
      Array.isArray(x)
        ? x.map(sort)
        : x && typeof x === 'object'
          ? Object.fromEntries(
              Object.entries(x as object)
                .sort(([a], [b]) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
                .map(([k, val]) => [k, sort(val)])
            )
          : x
    return sort(v) as T | null
  }
}

describe('LtiPlayService', () => {
  describe('where the play stands', () => {
    it('starts on the first interactive node', async () => {
      const { svc } = setup()
      expect(await svc.view(session)).toEqual({
        node: 'd1',
        done: false,
        choices: {},
        quant: {},
        sql: {},
        hints: [],
      })
    })

    it('404s a scenario that is not published, and 500s one with no rubric', async () => {
      await fails(setup({ scenario: null }).svc.view(session), 404)
      await fails(
        setup({ scenario: { ...data, rubric: { dimensions: [] } } }).svc.view(session),
        500
      )
    })
  })

  describe('a decision', () => {
    it('records the choice and moves past the narrative transition', async () => {
      const { svc } = setup()
      expect(await svc.choose(session, 'd1', 'A')).toEqual({ next: 'q1', done: false })
      expect((await svc.view(session)).choices).toEqual({ d1: 'A' })
    })

    it('refuses a choice that is not on the node', async () => {
      await fails(setup().svc.choose(session, 'd1', 'Z'), 400)
      await fails(setup().svc.choose(session, 'd1', undefined), 400)
    })

    it('refuses another node, an answered node and the wrong kind of question', async () => {
      const { svc } = setup()
      await fails(svc.choose(session, 'q1', 'A'), 409)
      await fails(svc.choose(session, undefined, 'A'), 409)
      await svc.choose(session, 'd1', 'A')
      await fails(svc.choose(session, 'd1', 'B'), 409)
      await fails(svc.grantQuant(session, 'q2', { value: 1 }), 409)
      // q1 is current but is a quant node
      await fails(svc.choose(session, 'q1', 'A'), 400)
    })
  })

  describe('a quant answer', () => {
    it('grades against the band and reveals the key only now', async () => {
      const { svc } = setup()
      await svc.choose(session, 'd1', 'A')
      const out = await svc.grantQuant(session, 'q1', { value: 85, variables: { a: 3 } })
      expect(out).toEqual({
        next: 'q2',
        done: false,
        results: [{ fieldId: 'f', modelAnswer: 100, userAnswer: 85, band: 'accepted' }],
        reveal: { f: { acceptedRange: band, modelAnswer: 100, derivation: 'because' } },
      })
      expect((await svc.view(session)).quant).toEqual({ q1: { value: 85, variables: { a: 3 } } })
    })

    it('grades each field of a structured answer', async () => {
      const { svc } = setup()
      await svc.choose(session, 'd1', 'A')
      await svc.grantQuant(session, 'q1', { value: 100 })
      const out = await svc.grantQuant(session, 'q2', { fields: { a: 100, b: 9 } })
      expect(out.results.map((r) => r.band)).toEqual(['ideal', 'high'])
      expect(out.next).toBe('s1')
    })

    it('answers each question once, so the verdict cannot be used to hunt for the band', async () => {
      const { svc } = setup()
      await svc.choose(session, 'd1', 'A')
      await svc.grantQuant(session, 'q1', { value: 5 })
      await fails(svc.grantQuant(session, 'q1', { value: 100 }), 409)
    })

    it.each([
      ['no answer', undefined],
      ['a string', 'ten'],
      ['no value', {}],
      ['a non-numeric value', { value: '100' }],
      ['NaN', { value: Number.NaN }],
      ['Infinity', { value: Infinity }],
      ['non-numeric variables', { value: 1, variables: { a: 'x' } }],
      ['variables that are not a record', { value: 1, variables: [1] }],
    ])('400s %s and keeps the question open', async (_n, answer) => {
      const { svc } = setup()
      await svc.choose(session, 'd1', 'A')
      await fails(svc.grantQuant(session, 'q1', answer), 400)
      expect((await svc.view(session)).node).toBe('q1')
    })

    it('400s a structured answer missing a field', async () => {
      const { svc } = setup()
      await svc.choose(session, 'd1', 'A')
      await svc.grantQuant(session, 'q1', { value: 1 })
      await fails(svc.grantQuant(session, 'q2', { fields: { a: 1 } }), 400)
      await fails(svc.grantQuant(session, 'q2', { value: 1 }), 400)
    })

    it('limits the number of variables it will keep', async () => {
      const { svc } = setup()
      await svc.choose(session, 'd1', 'A')
      const variables = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`v${i}`, 1]))
      await fails(svc.grantQuant(session, 'q1', { value: 1, variables }), 400)
    })
  })

  describe('a SQL answer', () => {
    async function toSql(h: ReturnType<typeof setup>) {
      await h.svc.choose(session, 'd1', 'A')
      await h.svc.grantQuant(session, 'q1', { value: 100 })
      await h.svc.grantQuant(session, 'q2', { fields: { a: 100, b: 1.5 } })
    }

    it('runs the query and the reference on the dataset and compares the rows', async () => {
      const h = setup()
      await toSql(h)
      const out = await h.svc.gradeSql(session, 's1', '  select 1  ')
      expect(h.runner.executeMany).toHaveBeenCalledWith('create table t(x int);', [
        'select 1',
        'select 1',
      ])
      expect(out).toEqual({
        next: 'end',
        done: true,
        correct: true,
        expected: { columns: ['x'], rows: [[1]], rowCount: 1, command: 'SELECT' },
        referenceSql: 'select 1',
      })
      expect((await h.svc.view(session)).done).toBe(true)
    })

    it('marks different rows wrong and says why', async () => {
      const h = setup()
      await toSql(h)
      h.runner.executeMany.mockResolvedValue([rows([[1]]), rows([[1], [2]])])
      const out = await h.svc.gradeSql(session, 's1', 'select x')
      expect(out).toMatchObject({ correct: false, reason: 'expected 1 row(s), got 2' })
    })

    it('marks a query that errors wrong, with the database message', async () => {
      const h = setup()
      await toSql(h)
      h.runner.executeMany.mockResolvedValue([
        rows([[1]]),
        { ok: false, error: 'syntax error at "selec"' },
      ])
      const out = await h.svc.gradeSql(session, 's1', 'selec 1')
      expect(out).toMatchObject({ correct: false, reason: 'syntax error at "selec"' })
    })

    it('does not cost the learner their answer when the reference query is broken or the runner fails', async () => {
      const h = setup()
      await toSql(h)
      h.runner.executeMany.mockResolvedValueOnce([{ ok: false, error: 'boom' }, rows([[1]])])
      await fails(h.svc.gradeSql(session, 's1', 'select 1'), 503)
      h.runner.executeMany.mockRejectedValueOnce(new Error('pglite'))
      await fails(h.svc.gradeSql(session, 's1', 'select 1'), 503)
      expect((await h.svc.view(session)).node).toBe('s1')
      await expect(h.svc.gradeSql(session, 's1', 'select 1')).resolves.toMatchObject({
        correct: true,
      })
    })

    it('503s when the dataset is gone', async () => {
      const h = setup()
      await toSql(h)
      h.prisma.dataset.findUnique.mockResolvedValue(null as never)
      await fails(h.svc.gradeSql(session, 's1', 'select 1'), 503)
    })

    it.each([[undefined], [''], ['   '], ['x'.repeat(20_001)], [42]])(
      '400s the query %p',
      async (q) => {
        const h = setup()
        await toSql(h)
        await fails(h.svc.gradeSql(session, 's1', q), 400)
        expect(h.runner.executeMany).not.toHaveBeenCalled()
      }
    )

    it('grades a node once', async () => {
      const h = setup()
      await toSql(h)
      await h.svc.gradeSql(session, 's1', 'select 1')
      await fails(h.svc.gradeSql(session, 's1', 'select 2'), 409)
    })
  })

  describe('a hint', () => {
    it('reveals the hint and glossary for the current node and records it', async () => {
      const { svc } = setup()
      await svc.choose(session, 'd1', 'A')
      expect(await svc.hint(session, 'q1')).toEqual({ hint: 'multiply', footnote: 'glossary' })
      expect(await svc.hint(session, 'q1')).toEqual({ hint: 'multiply', footnote: 'glossary' })
      expect((await svc.view(session)).hints).toEqual(['q1'])
    })

    it('refuses a hint for another node, a node with none, or a finished play', async () => {
      const h = setup()
      await fails(h.svc.hint(session, 's1'), 409)
      await h.svc.choose(session, 'd1', 'A')
      await h.svc.grantQuant(session, 'q1', { value: 100 })
      await fails(h.svc.hint(session, 'q2'), 404)
      await h.svc.grantQuant(session, 'q2', { fields: { a: 100, b: 1.5 } })
      await h.svc.gradeSql(session, 's1', 'select 1')
      await fails(h.svc.hint(session, 's1'), 409)
    })
  })

  describe('finishing', () => {
    it('refuses to send a score before the play is finished', async () => {
      const h = setup()
      await fails(h.svc.complete(session), 400)
      await h.svc.choose(session, 'd1', 'A')
      await fails(h.svc.complete(session), 400)
      expect(h.tool.complete).not.toHaveBeenCalled()
    })

    it('scores the play from what the server recorded and posts that result', async () => {
      const h = setup()
      await playAll(h)
      expect(await h.svc.complete(session)).toEqual({ score: 80, returnUrl: 'http://learn/back' })
      expect(h.created).toHaveLength(1)
      const row = h.created[0].data
      expect(row).toMatchObject({
        userId: 'u1',
        scenarioId: 'ops-001',
        scenarioTitle: 'Ops decision',
        track: 'ops',
        // q2's second field has no ideal band, so that node is proficient (68) even when exact
        overallScore: 85,
        choiceSequence: ['A'],
      })
      expect(
        row.dimensionScores.create.map((d: { dimension: string; score: number }) => [
          d.dimension,
          d.score,
        ])
      ).toEqual([
        ['Judgment', 88],
        ['Quantitative Accuracy', 78],
        ['Technical Accuracy', 88],
      ])
      expect(h.tool.complete).toHaveBeenCalledWith(session, row.id)
    })

    it('scores wrong answers low, whatever the learner thinks they scored', async () => {
      const h = setup()
      await h.svc.choose(session, 'd1', 'B')
      await h.svc.grantQuant(session, 'q1', { value: 5 })
      await h.svc.grantQuant(session, 'q2', { fields: { a: 5, b: 5 } })
      h.runner.executeMany.mockResolvedValue([rows([[1]]), rows([[9]])])
      await h.svc.gradeSql(session, 's1', 'select 9')
      await h.svc.complete(session)
      expect(h.created[0].data.overallScore).toBe(42)
    })

    it('caps hinted answers at proficient', async () => {
      const h = setup()
      await h.svc.choose(session, 'd1', 'A')
      await h.svc.hint(session, 'q1')
      await h.svc.grantQuant(session, 'q1', { value: 100 })
      await h.svc.grantQuant(session, 'q2', { fields: { a: 100, b: 1.5 } })
      await h.svc.hint(session, 's1')
      await h.svc.gradeSql(session, 's1', 'select 1')
      await h.svc.complete(session)
      expect(
        h.created[0].data.dimensionScores.create.map((d: { score: number }) => d.score)
      ).toEqual([88, 68, 68])
    })

    it('reuses the stored result when the post is retried', async () => {
      const h = setup()
      await playAll(h)
      h.tool.complete.mockRejectedValueOnce(new LtiError('The score could not be sent', 502))
      await fails(h.svc.complete(session), 502)
      await h.svc.complete(session)
      expect(h.created).toHaveLength(1)
      expect(h.tool.complete).toHaveBeenCalledTimes(2)
      expect(h.tool.complete.mock.calls[1][1]).toBe(h.tool.complete.mock.calls[0][1])
    })

    it('refuses more answers once finished', async () => {
      const h = setup()
      await playAll(h)
      await fails(h.svc.choose(session, 'd1', 'A'), 409)
    })
  })

  describe('a play across requests and sessions', () => {
    it('is picked up again by a fresh instance, as after a reload or a restart', async () => {
      const h = setup()
      await h.svc.choose(session, 'd1', 'A')
      await h.svc.grantQuant(session, 'q1', { value: 90 })
      const view = await h.make().view(session)
      expect(view).toMatchObject({
        node: 'q2',
        done: false,
        choices: { d1: 'A' },
        quant: { q1: { value: 90 } },
      })
    })

    it('is kept separately for each LTI session', async () => {
      const h = setup()
      await h.svc.choose(session, 'd1', 'A')
      expect((await h.svc.view({ ...session, jti: 'j2' })).node).toBe('d1')
    })

    it('lets only one of two simultaneous answers to the same node through', async () => {
      const h = setup()
      const results = await Promise.allSettled([
        h.svc.choose(session, 'd1', 'A'),
        h.svc.choose(session, 'd1', 'B'),
      ])
      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
      expect(Object.keys((await h.svc.view(session)).choices)).toEqual(['d1'])
    })

    it('limits a learner to 60 requests a minute', async () => {
      const { svc } = setup()
      for (let i = 0; i < 60; i++) await svc.view(session)
      await fails(svc.view(session), 429)
      await expect(svc.view({ ...session, sub: 'u2' })).resolves.toBeDefined()
    })
  })

  describe('a scenario that is not set up properly', () => {
    it('500s rather than loop on transitions that never lead anywhere', async () => {
      const looping = {
        ...data,
        nodes: [
          { nodeId: 'a', type: 'transition', nextNodeId: 'b' },
          { nodeId: 'b', type: 'transition', nextNodeId: 'a' },
        ],
      }
      await fails(setup({ scenario: looping }).svc.view(session), 500)
    })

    it('500s when an answered node leads nowhere', async () => {
      const broken = {
        ...data,
        nodes: [
          {
            nodeId: 'd1',
            type: 'decision',
            choices: [{ id: 'A', nextNodeId: 'gone', qualitySignals: [] }],
          },
        ],
      }
      await fails(setup({ scenario: broken }).svc.choose(session, 'd1', 'A'), 500)
    })
  })

  describe('what a student query can and cannot do to the grade', () => {
    it("runs the reference query before the learner's, so nothing the learner writes can change it", async () => {
      const h = setup()
      await h.svc.choose(session, 'd1', 'A')
      await h.svc.grantQuant(session, 'q1', { value: 100 })
      await h.svc.grantQuant(session, 'q2', { fields: { a: 100, b: 1.5 } })
      await h.svc.gradeSql(session, 's1', 'COMMIT; DELETE FROM t; SELECT * FROM t')
      expect(h.runner.executeMany).toHaveBeenCalledWith('create table t(x int);', [
        'select 1',
        'COMMIT; DELETE FROM t; SELECT * FROM t',
      ])
    })

    it("reads the reference result from the first outcome and the learner's from the second", async () => {
      const h = setup()
      await h.svc.choose(session, 'd1', 'A')
      await h.svc.grantQuant(session, 'q1', { value: 100 })
      await h.svc.grantQuant(session, 'q2', { fields: { a: 100, b: 1.5 } })
      h.runner.executeMany.mockResolvedValue([rows([[1]]), rows([[2]])])
      const out = await h.svc.gradeSql(session, 's1', 'select 2')
      expect(out).toMatchObject({ correct: false, expected: { rows: [[1]] } })
    })
  })

  describe('a play that loses its lock', () => {
    it('does not save over, or release the lock of, the request that took it next', async () => {
      const h = setup({ store: new JsonbStore() })
      await h.svc.choose(session, 'd1', 'A')
      await h.svc.grantQuant(session, 'q1', { value: 100 })
      await h.svc.grantQuant(session, 'q2', { fields: { a: 100, b: 1.5 } })
      // the grade runs past the lock's lifetime, and another request takes the lock meanwhile
      h.runner.executeMany.mockImplementationOnce(async () => {
        await h.store.release('lti-play-lock', session.jti)
        await h.store.claim('lti-play-lock', session.jti, 60)
        await h.store.put('lti-play-lock', session.jti, 'someone-else', 60)
        return [rows([[1]]), rows([[1]])]
      })
      await fails(h.svc.gradeSql(session, 's1', 'select 1'), 503)
      // nothing was recorded, and the other request's lock is still its own
      expect((await h.svc.view(session)).sql).toEqual({})
      expect(await h.store.peek('lti-play-lock', session.jti)).toBe('someone-else')
    })

    it('creates no result row when it no longer holds the play', async () => {
      const h = setup()
      await playAll(h)
      h.tool.complete.mockImplementationOnce(async () => ({ score: 1, returnUrl: 'x' }))
      await h.store.release('lti-play-lock', session.jti)
      // take the lock away from the request just as it starts building the result
      const realCount = h.prisma.simulationResult.create
      realCount.mockClear()
      const original = h.store.peek.bind(h.store)
      let first = true
      h.store.peek = (async (scope: string, key: string) => {
        const v = await original(scope, key)
        if (scope === 'lti-play-lock' && first) {
          first = false
          return 'someone-else'
        }
        return v
      }) as typeof h.store.peek
      await fails(h.svc.complete(session), 503)
      expect(h.created).toHaveLength(0)
    })
  })

  describe('the order the learner played in', () => {
    it('is kept in the stored result even though the store does not keep key order', async () => {
      const decision = (id: string, next: string, signal: 'strong' | 'developing') => ({
        nodeId: id,
        type: 'decision',
        choices: [
          {
            id: 'A',
            nextNodeId: next,
            qualitySignals: [{ dimension: 'Judgment', quality: signal }],
          },
          { id: 'B', nextNodeId: next, qualitySignals: [] },
        ],
      })
      const scenario = {
        ...data,
        nodes: [
          decision('d10', 'd2', 'strong'),
          decision('d2', 'end', 'developing'),
          { nodeId: 'end', type: 'feedback' },
        ],
      }
      const h = setup({ scenario, store: new JsonbStore() })
      await h.svc.choose(session, 'd10', 'A')
      await h.svc.choose(session, 'd2', 'B')
      await h.svc.complete(session)
      expect(h.created[0].data.choiceSequence).toEqual(['A', 'B'])
      // with the key order the store gives back ('d2' before 'd10'), the old code would say B, A
    })
  })

  describe('a scenario that loops, or changes mid-play', () => {
    it('answers a node once even when the graph leads back to it', async () => {
      const looping = {
        ...data,
        nodes: [
          {
            nodeId: 'd1',
            type: 'decision',
            choices: [{ id: 'A', nextNodeId: 'd1', qualitySignals: [] }],
          },
          { nodeId: 'end', type: 'feedback' },
        ],
      }
      const h = setup({ scenario: looping })
      await h.svc.choose(session, 'd1', 'A')
      await fails(h.svc.choose(session, 'd1', 'A'), 409)
    })

    it('tells the learner to relaunch, rather than failing, when the node they are on was removed', async () => {
      const h = setup()
      await h.svc.choose(session, 'd1', 'A')
      h.prisma.scenario.findUnique.mockResolvedValue({
        scenarioId: 'ops-001',
        status: 'published',
        data: { ...data, nodes: data.nodes.filter((n) => n.nodeId !== 'q1') },
      } as never)
      await fails(h.svc.view(session), 409)
      await fails(h.svc.grantQuant(session, 'q1', { value: 100 }), 409)
    })
  })
})
