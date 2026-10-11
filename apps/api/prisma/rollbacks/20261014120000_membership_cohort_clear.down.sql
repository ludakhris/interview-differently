-- Undoes 20261014120000_membership_cohort_clear: the guard refuses any change of cohort again. Run it BEFORE
-- 20261014110000_tenant_rls.down.sql if both are being undone. Delete the row from "_prisma_migrations" afterwards.
BEGIN;
DROP TRIGGER IF EXISTS "Membership_keys" ON "Membership";
DROP FUNCTION IF EXISTS "membership_keys"();
CREATE TRIGGER "Membership_keys" BEFORE UPDATE ON "Membership"
  FOR EACH ROW EXECUTE FUNCTION "forbid_key_change"('userId', 'institutionId', 'cohortId');
COMMIT;
