/**
 * Runs a batch of queries in a child process of the API, so the API can kill it when a query runs
 * too long or grows too large (see SqlRunnerService.executeMany). PGlite runs on the thread that
 * calls it and ignores `statement_timeout`, so the only way to stop a runaway query is to kill the
 * process it runs in.
 *
 * Protocol (JSON over the IPC channel). In: one `{ setupSql, queries }`. Out: `{ type: 'ready' }`
 * once the dataset is loaded, then `{ type: 'outcome', index, outcome }` after each query, then
 * `{ type: 'done' }`; or `{ type: 'fatal', error }` if the dataset would not load.
 */
import { buildDb, runRolledBack } from './sql-exec'

interface Job {
  setupSql: string
  queries: string[]
}

const send = (m: unknown) =>
  new Promise<void>((resolve) => (process.send ? process.send(m, () => resolve()) : resolve()))

process.once('message', async (job: Job) => {
  try {
    const db = await buildDb(job.setupSql)
    await send({ type: 'ready' })
    for (let index = 0; index < job.queries.length; index++) {
      const outcome = await runRolledBack(db, job.queries[index])
      try {
        await send({ type: 'outcome', index, outcome })
      } catch {
        // a result that cannot cross the process boundary fails that query alone
        await send({
          type: 'outcome',
          index,
          outcome: { ok: false, error: "This query's result could not be returned." },
        })
      }
    }
    await send({ type: 'done' })
  } catch (err) {
    await send({ type: 'fatal', error: (err as Error).message })
  } finally {
    process.exit(0)
  }
})
