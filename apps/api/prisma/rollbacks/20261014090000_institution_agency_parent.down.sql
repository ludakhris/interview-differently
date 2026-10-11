-- Undo prisma/migrations/20261014090000_institution_agency_parent (GitHub issue #84). Run it before undoing
-- the data step (scripts/assign-standalone-agency.ts --rollback), which clears parents the rule would refuse.
DROP TRIGGER IF EXISTS "Institution_parent_is_agency" ON "Institution";
DROP FUNCTION IF EXISTS "institution_parent_is_agency"();
ALTER TABLE "Institution" DROP CONSTRAINT IF EXISTS "Institution_agency_parent_check";
