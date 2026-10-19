-- The restricted role the API connects as (ld_app by default, scripts/create-app-role.ts) may add to and read
-- "DataAccessLog" but no longer change or delete it, so the trail of staff access to notes, compensation and resumes
-- cannot be edited by the application. Every role other than the table's owner that holds UPDATE, DELETE or TRUNCATE
-- on it loses them, whatever the role is named. The owner (migrations, seed, scripts) keeps full access. On a fresh
-- local or test database no other role holds them yet, so this does nothing; create-app-role.ts applies the same rule
-- (src/core/app-role-grants.ts). The API only ever creates and lists these rows (src/learn/data-access-log.service.ts).
-- Privileges only, no data change.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT g.grantee
    FROM information_schema.role_table_grants g
    JOIN pg_tables t ON t.schemaname = g.table_schema AND t.tablename = g.table_name
    WHERE g.table_schema = 'public'
      AND g.table_name = 'DataAccessLog'
      AND g.privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')
      AND g.grantee <> t.tableowner
      AND g.grantee <> 'PUBLIC'
  LOOP
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON "DataAccessLog" FROM %I', r.grantee);
  END LOOP;
END
$$;
