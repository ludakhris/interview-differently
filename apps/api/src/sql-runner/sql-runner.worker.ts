import { parentPort, workerData } from 'worker_threads'
import { SqlRunnerCore } from './sql-runner.core'

/**
 * Worker-thread entry for SqlRunnerService. Runs one core method and posts
 * results back; executeMany streams each outcome as it finishes so the parent
 * can tell which query is the one that hung.
 */
async function main() {
  const { method, args } = workerData as { method: string; args: unknown[] }
  const core = new SqlRunnerCore()
  try {
    let result: unknown
    if (method === 'executeMany') {
      const [setupSql, queries] = args as [string, string[]]
      result = await core.executeMany(setupSql, queries, (outcome) =>
        parentPort?.postMessage({ type: 'outcome', outcome })
      )
    } else if (method === 'introspect') {
      result = await core.introspect(args[0] as string)
    } else if (method === 'execute') {
      result = await core.execute(args[0] as string, args[1] as string)
    } else {
      throw new Error(`Unknown method ${method}`)
    }
    parentPort?.postMessage({ type: 'done', result })
  } catch (err) {
    parentPort?.postMessage({ type: 'error', error: (err as Error).message })
  }
}

void main()
