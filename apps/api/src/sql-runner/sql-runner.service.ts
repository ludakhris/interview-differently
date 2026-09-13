import { Injectable } from '@nestjs/common'
import { PGlite } from '@electric-sql/pglite'

/**
 * Server-side PGlite runner.
 *
 * Every call builds a fresh in-memory Postgres from a dataset's setup script,
 * so results are always computed against pristine data — the same data the
 * browser sandbox loads. Used today to validate/introspect datasets on save;
 * Phase 2 (#25) reuses it to grade assessment SQL answers authoritatively.
 *
 * Instances are intentionally not cached: a fresh build is ~1s and caching
 * would need invalidation on setupSql edits plus rollback between runs.
 */

export interface SchemaColumn {
  name: string
  type: string
}

export interface SchemaTable {
  table: string
  columns: SchemaColumn[]
  rowCount: number
}

export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  command: string
}

// Return dates / numerics as their Postgres text form instead of JS Date /
// number so results look like psql output and compare byte-for-byte between
// browser and server runs.
const TEXT_PARSERS: Record<number, (v: string) => string> = {
  1082: (v) => v, // date
  1114: (v) => v, // timestamp
  1184: (v) => v, // timestamptz
  1700: (v) => v, // numeric
}

@Injectable()
export class SqlRunnerService {
  async build(setupSql: string): Promise<PGlite> {
    const db = new PGlite({ parsers: TEXT_PARSERS })
    try {
      await db.exec(setupSql)
    } catch (err) {
      await db.close()
      throw err
    }
    return db
  }

  /** Runs the setup script and returns the resulting public schema. Throws on SQL error. */
  async introspect(setupSql: string): Promise<SchemaTable[]> {
    const db = await this.build(setupSql)
    try {
      const cols = await db.query<{ table_name: string; column_name: string; data_type: string }>(
        `SELECT table_name, column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public'
         ORDER BY table_name, ordinal_position`,
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
      const results = await db.exec(sql)
      const last = results[results.length - 1]
      if (!last) return { columns: [], rows: [], rowCount: 0, command: '' }
      const columns = last.fields.map((f) => f.name)
      const rows = last.rows.map((r) => columns.map((c) => (r as Record<string, unknown>)[c]))
      return { columns, rows, rowCount: rows.length, command: last.command ?? '' }
    } finally {
      await db.close()
    }
  }
}
