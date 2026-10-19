import { dbTestsEnabled, migratedDb, migrationSql } from './testing/tenant-db'

// The migration that makes the data access log append-only for the API's role, whatever that role is named.
const suite = dbTestsEnabled ? describe : describe.skip

suite('append-only audit log migration', () => {
  it('takes UPDATE, DELETE and TRUNCATE from every non-owner role, and leaves INSERT and SELECT', async () => {
    const db = await migratedDb()
    try {
      await db.exec(
        `CREATE ROLE prod_app NOLOGIN; GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON "DataAccessLog" TO prod_app;`
      )
      await db.exec(migrationSql('20261019090000_append_only_audit_log'))
      const can = async (priv: string) =>
        (
          await db.query<{ ok: boolean }>(
            `SELECT has_table_privilege('prod_app', '"DataAccessLog"', '${priv}') AS ok`
          )
        ).rows[0].ok
      expect(await can('SELECT')).toBe(true)
      expect(await can('INSERT')).toBe(true)
      for (const priv of ['UPDATE', 'DELETE', 'TRUNCATE']) expect(await can(priv)).toBe(false)
    } finally {
      await db.close()
    }
  })
})
