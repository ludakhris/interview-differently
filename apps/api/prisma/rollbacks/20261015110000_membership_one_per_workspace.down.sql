-- Undoes 20261015110000_membership_one_per_workspace. The duplicate rows it removed are not restored.
-- Delete the row from "_prisma_migrations" afterwards.
DROP TRIGGER IF EXISTS "Cohort_clear_memberships" ON "Cohort";
DROP FUNCTION IF EXISTS "cohort_clear_memberships"();
DROP INDEX IF EXISTS "Membership_workspace_unique";
