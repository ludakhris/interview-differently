import { PGlite } from '@electric-sql/pglite'

/**
 * Browser-side PGlite instance for the SQL sandbox (#25).
 *
 * Each student gets a private in-memory Postgres built from the dataset's
 * setup script. Nothing they run can touch anyone else's data, so there is
 * no read-only guard — `reset()` rebuilds from the script if they break it.
 *
 * Date / numeric columns are returned as Postgres text (not JS Date /
 * number) so the grid shows values the way psql would, and so a server-side
 * run of the same query produces byte-identical output for grading.
 */

export interface SandboxResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  command: string
  durationMs: number
}

export const ROW_CAP = 500

const TEXT_PARSERS: Record<number, (v: string) => string> = {
  1082: (v) => v, // date
  1114: (v) => v, // timestamp
  1184: (v) => v, // timestamptz
  1700: (v) => v, // numeric
}

export class SandboxDb {
  private db: PGlite | null = null

  constructor(private readonly setupSql: string) {}

  async load(): Promise<void> {
    await this.close()
    const db = new PGlite({ parsers: TEXT_PARSERS })
    await db.exec(this.setupSql)
    this.db = db
  }

  async reset(): Promise<void> {
    await this.load()
  }

  /** Runs one or more statements; returns the last statement's result. Throws on SQL error. */
  async run(sql: string): Promise<SandboxResult> {
    if (!this.db) throw new Error('Dataset not loaded')
    const started = performance.now()
    const results = await this.db.exec(sql)
    const durationMs = Math.round(performance.now() - started)
    const last = results[results.length - 1]
    if (!last) return { columns: [], rows: [], rowCount: 0, command: '', durationMs }
    const columns = last.fields.map((f) => f.name)
    const all = last.rows as Record<string, unknown>[]
    const rows = all.slice(0, ROW_CAP).map((r) => columns.map((c) => r[c]))
    return { columns, rows, rowCount: all.length, command: last.command ?? '', durationMs }
  }

  /**
   * Runs `sql` inside a transaction that is always rolled back, so grading a
   * submission (student query, then reference query) can't be skewed by
   * anything the candidate changed while exploring. Errors propagate.
   */
  async runIsolated(sql: string): Promise<SandboxResult> {
    if (!this.db) throw new Error('Dataset not loaded')
    await this.db.exec('BEGIN')
    try {
      return await this.run(sql)
    } finally {
      await this.db.exec('ROLLBACK')
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close()
      this.db = null
    }
  }
}
