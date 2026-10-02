import { Injectable } from '@nestjs/common'
import { Worker } from 'worker_threads'
import * as path from 'path'
import {
  SqlRunnerCore,
  type QueryOutcome,
  type QueryResult,
  type SchemaTable,
} from './sql-runner.core'

export type { QueryOutcome, QueryResult, SchemaTable, SchemaColumn } from './sql-runner.core'

/** Setup script + one query. Generous: setup alone is ~1s, a legit query well under that. */
const QUERY_TIMEOUT_MS = 10_000
const SETUP_TIMEOUT_MS = 30_000
/** After this many hung queries in one batch, stop retrying and fail the rest. */
const MAX_RESTARTS = 10

const TIMED_OUT: QueryOutcome = { ok: false, error: 'Query timed out' }

/**
 * Server-side PGlite runner.
 *
 * PGlite is WASM Postgres running on whatever thread calls it, so an
 * unbounded student query (`WITH RECURSIVE` loop, huge `generate_series`)
 * would block the API's event loop for everyone. Production therefore runs
 * every call in a worker thread with a hard timeout and terminates it if it
 * hangs. Under ts-jest (no compiled worker file) it runs in-process.
 *
 * Every call builds a fresh in-memory Postgres from a dataset's setup script,
 * so results are always computed against pristine data — the same data the
 * browser sandbox loads.
 */
@Injectable()
export class SqlRunnerService {
  private readonly core = new SqlRunnerCore()
  private readonly useWorker = __filename.endsWith('.js')

  async introspect(setupSql: string): Promise<SchemaTable[]> {
    if (!this.useWorker) return this.core.introspect(setupSql)
    return this.callWorker<SchemaTable[]>('introspect', [setupSql], SETUP_TIMEOUT_MS)
  }

  async execute(setupSql: string, sql: string): Promise<QueryResult> {
    if (!this.useWorker) return this.core.execute(setupSql, sql)
    return this.callWorker<QueryResult>('execute', [setupSql, sql], SETUP_TIMEOUT_MS)
  }

  /**
   * Several queries against one fresh instance, each in a rolled-back
   * transaction. A query that hangs is terminated and reported as a failed
   * outcome; the rest re-run on a fresh worker so one bad answer can't sink
   * the whole grading pass.
   */
  async executeMany(setupSql: string, queries: string[]): Promise<QueryOutcome[]> {
    if (!this.useWorker) return this.core.executeMany(setupSql, queries)

    const out: QueryOutcome[] = []
    let restarts = 0
    while (out.length < queries.length) {
      const remaining = queries.slice(out.length)
      const got: QueryOutcome[] = []
      try {
        await this.callWorker('executeMany', [setupSql, remaining], SETUP_TIMEOUT_MS, {
          perOutcomeMs: QUERY_TIMEOUT_MS,
          onOutcome: (o) => got.push(o),
        })
        out.push(...got)
      } catch (err) {
        if (!(err instanceof TimeoutError)) throw err
        out.push(...got, TIMED_OUT) // `got` finished; the next query is the one that hung
        restarts++
        if (restarts >= MAX_RESTARTS) {
          while (out.length < queries.length) out.push(TIMED_OUT)
        }
      }
    }
    return out
  }

  private callWorker<T>(
    method: string,
    args: unknown[],
    firstTimeoutMs: number,
    opts: { perOutcomeMs?: number; onOutcome?: (o: QueryOutcome) => void } = {}
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'sql-runner.worker.js'), {
        workerData: { method, args },
      })
      let timer: NodeJS.Timeout
      const settle = (fn: () => void) => {
        clearTimeout(timer)
        void worker.terminate()
        fn()
      }
      const arm = (ms: number) => {
        clearTimeout(timer)
        timer = setTimeout(() => settle(() => reject(new TimeoutError())), ms)
      }
      arm(firstTimeoutMs)
      worker.on(
        'message',
        (m: { type: string; outcome?: QueryOutcome; result?: T; error?: string }) => {
          if (m.type === 'outcome') {
            opts.onOutcome?.(m.outcome as QueryOutcome)
            arm(opts.perOutcomeMs ?? firstTimeoutMs)
          } else if (m.type === 'done') {
            settle(() => resolve(m.result as T))
          } else if (m.type === 'error') {
            settle(() => reject(new Error(m.error)))
          }
        }
      )
      worker.on('error', (err) => settle(() => reject(err)))
      worker.on('exit', (code) => {
        if (code !== 0) settle(() => reject(new Error(`SQL worker exited with code ${code}`)))
      })
    })
  }
}

class TimeoutError extends Error {
  constructor() {
    super('SQL execution timed out')
  }
}
