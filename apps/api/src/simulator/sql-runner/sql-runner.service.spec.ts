import { EventEmitter } from 'node:events'
import { SqlRunnerBusyError, SqlRunnerService, type ChildLike } from './sql-runner.service'
import type { QueryOutcome } from './sql-exec'

/**
 * The runner's handling of the child process that runs learner SQL: what happens when a query runs
 * too long, grows too large, or kills its process, and how many run at once. A fake child stands
 * in for the real one (real PGlite cannot run under jest; the real thing is checked by hand).
 */

const ok = (n: number): QueryOutcome => ({
  ok: true,
  result: { columns: ['n'], rows: [[n]], rowCount: 1, command: 'SELECT' },
})

type Step =
  | 'ready'
  | { outcome: QueryOutcome }
  | 'done'
  | 'hang' // say nothing more
  | 'crash' // the process dies
  | { fatal: string }

class FakeChild extends EventEmitter implements ChildLike {
  pid = 4242
  killed = false
  job: { setupSql: string; queries: string[] } | null = null
  constructor(private plan: Step[]) {
    super()
  }
  send(job: { setupSql: string; queries: string[] }) {
    this.job = job
    // replies arrive on later ticks, as they do from a real child
    setImmediate(() => this.play())
  }
  private play() {
    let index = 0
    for (const step of this.plan) {
      if (this.killed) return
      if (step === 'ready') this.emit('message', { type: 'ready' })
      else if (step === 'done') this.emit('message', { type: 'done' })
      else if (step === 'hang') return
      else if (step === 'crash') return this.die()
      else if ('outcome' in step)
        this.emit('message', { type: 'outcome', index: index++, outcome: step.outcome })
      else this.emit('message', { type: 'fatal', error: step.fatal })
    }
  }
  private die() {
    this.killed = true
    setImmediate(() => this.emit('disconnect'))
  }
  kill() {
    if (!this.killed) this.die()
  }
}

function setup(plans: Step[][], limits: Partial<SqlRunnerService['limits']> = {}) {
  const svc = new SqlRunnerService()
  svc.limits = {
    ...svc.limits,
    queryMs: 40,
    buildMs: 60,
    totalMs: 5_000,
    queueMs: 60,
    pollMs: 10,
    ...limits,
  }
  const children: FakeChild[] = []
  svc.spawn = () => {
    const c = new FakeChild(plans[children.length] ?? ['ready', 'hang'])
    children.push(c)
    return c
  }
  return { svc, children }
}

const errorOf = (o: QueryOutcome) => (o.ok ? undefined : o.error)

describe('SqlRunnerService.executeMany', () => {
  it("returns each query's outcome and stops the child afterwards", async () => {
    const { svc, children } = setup([['ready', { outcome: ok(1) }, { outcome: ok(2) }, 'done']])
    const out = await svc.executeMany('create table t(x int);', ['q1', 'q2'])
    expect(out).toEqual([ok(1), ok(2)])
    expect(children).toHaveLength(1)
    expect(children[0].job).toEqual({ setupSql: 'create table t(x int);', queries: ['q1', 'q2'] })
    expect(children[0].killed).toBe(true)
  })

  it("keeps a query's own error as its outcome", async () => {
    const bad: QueryOutcome = { ok: false, error: 'syntax error' }
    const { svc } = setup([['ready', { outcome: ok(1) }, { outcome: bad }, 'done']])
    expect(await svc.executeMany('', ['a', 'b'])).toEqual([ok(1), bad])
  })

  it('kills a query that runs too long, and says so in its outcome', async () => {
    const { svc, children } = setup([['ready', { outcome: ok(1) }, 'hang']])
    const out = await svc.executeMany('', ['reference', 'learner'])
    expect(out[0]).toEqual(ok(1))
    expect(errorOf(out[1])).toBe(
      'Your query took longer than 0 seconds and was stopped.'.replace('0 seconds', '0 seconds')
    )
    expect(children[0].killed).toBe(true)
  })

  it('names the limit in seconds', async () => {
    const { svc } = setup([['ready', 'hang']], { queryMs: 5_000, totalMs: 60 })
    // the call's own deadline (60 ms) ends the wait first; the message still names the 5 s limit
    const out = await svc.executeMany('', ['q'])
    expect(errorOf(out[0])).toBe('Your query took longer than 5 seconds and was stopped.')
  })

  it('runs the queries after a stopped one on a fresh child, so one slow query costs only itself', async () => {
    const { svc, children } = setup([
      ['ready', 'hang'],
      ['ready', { outcome: ok(2) }, { outcome: ok(3) }, 'done'],
    ])
    const out = await svc.executeMany('setup', ['slow', 'b', 'c'])
    expect(errorOf(out[0])).toMatch(/took longer than/)
    expect(out.slice(1)).toEqual([ok(2), ok(3)])
    expect(children).toHaveLength(2)
    expect(children[1].job).toEqual({ setupSql: 'setup', queries: ['b', 'c'] })
  })

  it('treats a process that dies mid-query as that query failing', async () => {
    const { svc } = setup([['ready', { outcome: ok(1) }, 'crash']])
    const out = await svc.executeMany('', ['a', 'b'])
    expect(out[0]).toEqual(ok(1))
    expect(errorOf(out[1])).toBe('Your query could not be run.')
  })

  it('stops a query whose process grows past the memory limit', async () => {
    const { svc, children } = setup([['ready', 'hang']], {
      queryMs: 5_000,
      totalMs: 5_000,
      maxRssMb: 512,
    })
    svc.rssMb = () => 2_048
    const out = await svc.executeMany('', ['hog'])
    expect(errorOf(out[0])).toBe('Your query used too much memory and was stopped.')
    expect(children[0].killed).toBe(true)
  })

  it('does not stop a query whose memory is under the limit, or unknown', async () => {
    const { svc } = setup([['ready', { outcome: ok(1) }, 'done']], { maxRssMb: 512 })
    svc.rssMb = () => undefined
    expect(await svc.executeMany('', ['a'])).toEqual([ok(1)])
  })

  it('fails every query, without retrying, when the dataset will not load', async () => {
    const { svc, children } = setup([[{ fatal: 'syntax error in setup' }]])
    const out = await svc.executeMany('bad setup', ['a', 'b'])
    expect(out.map(errorOf)).toEqual(['syntax error in setup', 'syntax error in setup'])
    expect(children).toHaveLength(1)
  })

  it('gives up on a dataset that takes too long to load', async () => {
    const { svc, children } = setup([['hang']])
    const out = await svc.executeMany('slow setup', ['a'])
    expect(errorOf(out[0])).toBe('The practice database took too long to load.')
    expect(children[0].killed).toBe(true)
  })

  it('ends the whole call within its total budget, failing the queries it had no time for', async () => {
    const { svc } = setup([], { queryMs: 5_000, totalMs: 80 })
    const started = Date.now()
    const out = await svc.executeMany('', ['a', 'b', 'c'])
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(out.every((o) => !o.ok)).toBe(true)
    expect(out.map(errorOf).every((e) => /took longer|ran out of time/.test(e ?? ''))).toBe(true)
  })
})

describe("SqlRunnerService outcomes that are nobody's wrong answer", () => {
  it("marks a query stopped by a limit as stopped, so a learner's own is theirs and a reference is not", async () => {
    const { svc } = setup([['ready', 'hang']])
    const out = await svc.executeMany('', ['q'])
    expect(out[0]).toMatchObject({ ok: false, stopped: true })
    expect(out[0]).not.toHaveProperty('infra')
  })

  it('marks a dataset that will not load, or load in time, as a grading failure', async () => {
    const a = await setup([[{ fatal: 'bad setup' }]]).svc.executeMany('', ['a', 'b'])
    expect(a).toEqual([
      { ok: false, error: 'bad setup', infra: true },
      { ok: false, error: 'bad setup', infra: true },
    ])
    const b = await setup([['hang']]).svc.executeMany('', ['a'])
    expect(b[0]).toMatchObject({ ok: false, infra: true })
  })

  it('marks queries it had no time for as a grading failure', async () => {
    const { svc } = setup([], { queryMs: 5_000, totalMs: 0 })
    const out = await svc.executeMany('', ['a'])
    expect(out[0]).toMatchObject({ ok: false, infra: true })
  })

  it('marks everything as a grading failure when the process cannot even start', async () => {
    const { svc } = setup([])
    svc.spawn = () => {
      const c = new FakeChild([])
      setImmediate(() => c.emit('error', new Error('spawn EAGAIN')))
      return c
    }
    const out = await svc.executeMany('', ['a'])
    expect(out[0]).toMatchObject({
      ok: false,
      infra: true,
      error: 'Grading could not start. Try again.',
    })
  })
})

describe('SqlRunnerService robustness', () => {
  it("counts the wait for a slot inside the call's total time", async () => {
    let clock = 0
    const { svc } = setup([['ready', 'hang'], slowPlan()], {
      maxChildren: 1,
      queueMs: 5_000,
      queryMs: 30,
      totalMs: 40,
    })
    svc.now = () => clock
    const first = svc.executeMany('', ['hog'])
    const second = svc.executeMany('', ['q'])
    clock = 1_000 // the second call has waited past its whole budget
    await first
    // so it has no time left to run, and says grading failed rather than scoring anything
    expect((await second)[0]).toMatchObject({ ok: false, infra: true })
  })

  it('ignores a message that is not an object', async () => {
    const { svc } = setup([['ready', { outcome: ok(1) }, 'done']])
    const spawn = svc.spawn
    svc.spawn = () => {
      const c = spawn() as FakeChild
      setImmediate(() => c.emit('message', null))
      setImmediate(() => c.emit('message', 'text'))
      return c
    }
    expect(await svc.executeMany('', ['a'])).toEqual([ok(1)])
  })

  it('does not add an outcome for a query that finished, even if its time is up before the child says done', async () => {
    const { svc } = setup([['ready', { outcome: ok(1) }, 'hang']], { queryMs: 15, totalMs: 5_000 })
    const out = await svc.executeMany('', ['a'])
    // 'done' never comes, but the one query had answered: its outcome stays and none is added
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual(ok(1))
  })
})

const slowPlan = (): Step[] => ['ready', { outcome: ok(1) }, 'done']

describe('SqlRunnerService concurrency', () => {
  const slow: Step[] = ['ready', { outcome: ok(1) }, 'done']

  it('runs no more grading children at once than the limit, and queues the rest', async () => {
    const { svc, children } = setup([slow, slow, slow], { maxChildren: 1, queueMs: 2_000 })
    let running = 0
    let peak = 0
    const spawn = svc.spawn
    svc.spawn = () => {
      running++
      peak = Math.max(peak, running)
      const c = spawn() as FakeChild
      c.on('disconnect', () => running--)
      return c
    }
    const all = await Promise.all([
      svc.executeMany('', ['q']),
      svc.executeMany('', ['q']),
      svc.executeMany('', ['q']),
    ])
    expect(all.every((o) => o[0].ok)).toBe(true)
    expect(peak).toBe(1)
    expect(children).toHaveLength(3)
  })

  it('answers "busy" when no slot frees up in time, and serves the next call after', async () => {
    const { svc } = setup([['ready', 'hang'], slow], {
      maxChildren: 1,
      queueMs: 20,
      queryMs: 200,
      totalMs: 5_000,
    })
    const first = svc.executeMany('', ['hog'])
    await expect(svc.executeMany('', ['q'])).rejects.toBeInstanceOf(SqlRunnerBusyError)
    await first
    expect((await svc.executeMany('', ['q']))[0].ok).toBe(true)
  })

  it('is a 503, so a caller that does not handle it still answers "try again"', () => {
    expect(new SqlRunnerBusyError().getStatus()).toBe(503)
  })

  it('frees its slot when a call finishes, however it ends', async () => {
    const { svc } = setup([[{ fatal: 'x' }], slow], { maxChildren: 1, queueMs: 20 })
    await svc.executeMany('', ['a'])
    expect((await svc.executeMany('', ['b']))[0].ok).toBe(true)
  })
})
