import { fork } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import type { PGlite } from '@electric-sql/pglite'
import { buildDb, runOne } from './sql-exec'
import type { QueryOutcome, QueryResult, SchemaTable } from './sql-exec'

export type { QueryOutcome, QueryResult, SchemaColumn, SchemaTable } from './sql-exec'

/**
 * Server-side PGlite runner.
 *
 * Every call builds a fresh in-memory Postgres from a dataset's setup script,
 * so results are always computed against pristine data — the same data the
 * browser sandbox loads. Used to validate/introspect datasets on save and to
 * grade SQL answers authoritatively (assessments, launched simulations).
 *
 * Instances are intentionally not cached: a fresh build is ~0.5s and caching
 * would need invalidation on setupSql edits plus rollback between runs.
 *
 * Learner SQL (`executeMany`) never runs in the API process. PGlite runs on the thread that calls
 * it, ignores `statement_timeout` (measured), and freezes the whole process while a query runs, so
 * a runaway query would stall every user. It runs in a child process that is killed when a query
 * runs too long or grows too large, and only a few run at once.
 */

/** Thrown when every grading slot stays busy for too long. A 503, so callers can answer "try again". */
export class SqlRunnerBusyError extends ServiceUnavailableException {
  constructor() {
    super('Grading is busy. Try again in a moment.')
  }
}

export interface RunnerLimits {
  /** How long one query may run before its process is killed. */
  queryMs: number
  /** How long the dataset may take to load. */
  buildMs: number
  /** A whole `executeMany` call, across restarts. */
  totalMs: number
  /** Grading processes at once. */
  maxChildren: number
  /** How long a call waits for a free slot before giving up. */
  queueMs: number
  /** Largest resident memory a grading process may reach (checked on Linux, where /proc exists). */
  maxRssMb: number
  /** How often memory is checked while a query runs. */
  pollMs: number
}

/** The slice of a child process the runner uses, so tests can stand in for one. */
export interface ChildLike {
  pid?: number
  send(message: unknown): unknown
  on(event: 'message', listener: (message: unknown) => void): unknown
  on(event: 'disconnect', listener: () => void): unknown
  on(event: 'error', listener: (err: Error) => void): unknown
  kill(signal: 'SIGKILL'): unknown
}

type WorkerMessage =
  | { type: 'ready' }
  | { type: 'outcome'; index: number; outcome: QueryOutcome }
  | { type: 'done' }
  | { type: 'fatal'; error: string }

interface Step {
  /** Outcomes for the queries tried, including the one that was stopped (last, with stoppedAt). */
  outcomes: QueryOutcome[]
  /** Index, within this step's queries, of the query that was stopped; absent when the batch finished. */
  stoppedAt?: number
  /** The dataset would not load: nothing ran. */
  fatal?: string
}

/** How long to wait for a killed process to be gone before moving on. */
const KILL_GRACE_MS = 1_000
/** How long a child may take to say 'done' once its last query has answered. */
const DONE_GRACE_MS = 1_000

const compiledWorker = join(__dirname, 'sql-worker.js')

/** Grading processes alive now, so none outlives the API if it exits mid-query. */
const live = new Set<ChildLike>()
let guarded = false
function guardExit() {
  if (guarded) return
  guarded = true
  const killAll = () => live.forEach((c) => c.kill('SIGKILL'))
  process.on('exit', killAll)
  // A termination signal ends Node without an 'exit' event. Kill the children, then let the signal
  // do what it would have done.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      killAll()
      process.kill(process.pid, signal)
    })
  }
}

/** A child that runs sql-worker: compiled when built, through ts-node when run from source. */
function forkWorker(): ChildLike {
  const compiled = existsSync(compiledWorker)
  return fork(compiled ? compiledWorker : join(__dirname, 'sql-worker.ts'), [], {
    execArgv: compiled ? [] : ['-r', 'ts-node/register/transpile-only'],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { NODE_ENV: process.env.NODE_ENV ?? '' },
  })
}

/** Resident memory of a process in MB on Linux (VmRSS); undefined elsewhere or if it is gone. */
function procRssMb(pid: number | undefined): number | undefined {
  if (!pid) return undefined
  try {
    const kb = Number(
      /^VmRSS:\s+(\d+)\s+kB/m.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1]
    )
    return Number.isFinite(kb) ? kb / 1024 : undefined
  } catch {
    return undefined
  }
}

@Injectable()
export class SqlRunnerService {
  /** Injectable for tests. */
  limits: RunnerLimits = {
    queryMs: 5_000,
    buildMs: 15_000,
    totalMs: 45_000,
    maxChildren: 2,
    queueMs: 10_000,
    maxRssMb: 1_024,
    pollMs: 200,
  }
  spawn: () => ChildLike = forkWorker
  rssMb: (pid: number | undefined) => number | undefined = procRssMb
  now: () => number = () => Date.now()

  private active = 0
  private waiters: (() => void)[] = []

  async build(setupSql: string): Promise<PGlite> {
    return buildDb(setupSql)
  }

  /** Runs the setup script and returns the resulting public schema. Throws on SQL error. */
  async introspect(setupSql: string): Promise<SchemaTable[]> {
    const db = await this.build(setupSql)
    try {
      const cols = await db.query<{ table_name: string; column_name: string; data_type: string }>(
        `SELECT table_name, column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public'
         ORDER BY table_name, ordinal_position`
      )
      const tables = new Map<string, SchemaTable>()
      for (const c of cols.rows) {
        let t = tables.get(c.table_name)
        if (!t) {
          t = { table: c.table_name, columns: [], rowCount: 0 }
          tables.set(c.table_name, t)
        }
        t.columns.push({ name: c.column_name, type: c.data_type })
      }
      for (const t of tables.values()) {
        const r = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "${t.table}"`)
        t.rowCount = r.rows[0]?.n ?? 0
      }
      return [...tables.values()]
    } finally {
      await db.close()
    }
  }

  /** Executes `sql` against a fresh instance of the dataset. Returns the last statement's result. */
  async execute(setupSql: string, sql: string): Promise<QueryResult> {
    const db = await this.build(setupSql)
    try {
      return await runOne(db, sql)
    } finally {
      await db.close()
    }
  }

  /**
   * Runs several queries, in order, against a fresh instance of the dataset, in a child process
   * that is killed if a query runs past `limits.queryMs` or grows past `limits.maxRssMb`. Each query
   * is in a rolled-back transaction. That does NOT make them independent: a statement can end the
   * transaction itself (`COMMIT; DELETE ...`) and change what every later query sees. Callers that
   * grade a learner's query against a reference must therefore run the reference queries first.
   *
   * Errors, time-outs and crashes are captured per query, not thrown; a query that comes after a
   * stopped one runs on a fresh instance. Throws SqlRunnerBusyError if no slot frees up in time.
   */
  async executeMany(setupSql: string, queries: string[]): Promise<QueryOutcome[]> {
    // the budget includes the wait for a slot, so a caller is never inside this call for longer
    const deadline = this.now() + this.limits.totalMs
    await this.acquire()
    try {
      return await this.runAll(setupSql, queries, deadline)
    } finally {
      this.release()
    }
  }

  private async runAll(
    setupSql: string,
    queries: string[],
    deadline: number
  ): Promise<QueryOutcome[]> {
    const out: QueryOutcome[] = queries.map(() => ({
      ok: false,
      error: 'This query was not run because grading ran out of time.',
      infra: true,
    }))
    let from = 0
    while (from < queries.length && this.now() < deadline) {
      const step = await this.runChild(setupSql, queries.slice(from), deadline)
      step.outcomes.forEach((o, i) => (out[from + i] = o))
      if (step.fatal !== undefined) {
        for (let i = from; i < queries.length; i++) {
          out[i] = { ok: false, error: step.fatal, infra: true }
        }
        break
      }
      if (step.stoppedAt === undefined) break
      from += step.stoppedAt + 1
    }
    return out
  }

  /** One child process for a batch; it is killed on the first query that must be stopped. */
  private runChild(setupSql: string, queries: string[], deadline: number): Promise<Step> {
    return new Promise((resolve) => {
      const { limits } = this
      const child = this.spawn()
      guardExit()
      live.add(child)
      const outcomes: QueryOutcome[] = []
      let loaded = false
      let settled = false
      let gone = false
      let pending: Step | undefined
      let timer: NodeJS.Timeout | undefined
      let grace: NodeJS.Timeout | undefined

      // The slot is only given back once the process is really gone, so the number of grading
      // processes (and the memory they hold) never exceeds the limit, even while one is being killed.
      const finish = (step: Step) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        clearInterval(watch)
        child.kill('SIGKILL')
        live.delete(child)
        if (gone) return resolve(step)
        pending = step
        grace = setTimeout(() => resolve(step), KILL_GRACE_MS)
      }
      /** The query that was running is stopped; the queries after it start on a new child. */
      const stop = (error: string) => {
        if (!loaded)
          return finish({ outcomes, fatal: 'The practice database could not be loaded.' })
        finish({
          outcomes: [...outcomes, { ok: false, error, stopped: true }],
          stoppedAt: outcomes.length,
        })
      }
      const tooLong = () =>
        stop(
          `Your query took longer than ${Math.round(limits.queryMs / 1000)} seconds and was stopped.`
        )
      const arm = (ms: number, then: () => void) => {
        if (settled) return
        clearTimeout(timer)
        timer = setTimeout(then, Math.max(1, Math.min(ms, deadline - this.now())))
      }

      arm(limits.buildMs, () =>
        finish({ outcomes, fatal: 'The practice database took too long to load.' })
      )
      const watch = setInterval(() => {
        const rss = this.rssMb(child.pid)
        if (rss !== undefined && rss > limits.maxRssMb)
          stop('Your query used too much memory and was stopped.')
      }, limits.pollMs)

      child.on('message', (raw) => {
        if (!raw || typeof raw !== 'object') return
        const m = raw as WorkerMessage
        if (m.type === 'ready') {
          loaded = true
          arm(limits.queryMs, tooLong)
        } else if (m.type === 'outcome') {
          outcomes.push(m.outcome)
          if (outcomes.length < queries.length) arm(limits.queryMs, tooLong)
          // every query has answered: a child that does not then say 'done' is simply let go
          else arm(DONE_GRACE_MS, () => finish({ outcomes }))
        } else if (m.type === 'done') {
          finish({ outcomes })
        } else if (m.type === 'fatal') {
          finish({ outcomes, fatal: m.error })
        }
      })
      child.on('error', () => finish({ outcomes, fatal: 'Grading could not start. Try again.' }))
      // The channel closes after every message already sent has been delivered (unlike 'exit', which
      // can come first), so a child gone without finishing means it ran out of memory or crashed.
      child.on('disconnect', () => {
        gone = true
        if (pending) {
          clearTimeout(grace)
          resolve(pending)
        } else stop('Your query could not be run.')
      })
      child.send({ setupSql, queries })
    })
  }

  private async acquire(): Promise<void> {
    if (this.active < this.limits.maxChildren) {
      this.active++
      return
    }
    await new Promise<void>((resolve, reject) => {
      const wake = () => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== wake)
        reject(new SqlRunnerBusyError())
      }, this.limits.queueMs)
      this.waiters.push(wake)
    })
  }

  /** Hands the slot to the next caller in line, or frees it. */
  private release(): void {
    const next = this.waiters.shift()
    if (next) next()
    else this.active--
  }
}
