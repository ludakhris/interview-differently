-- GitHub issue #84. A role offered to an email address before the person has an account: it becomes a membership
-- with that role the first time they open Learn Differently signed in with that (verified) email.
SET lock_timeout = '5s';

CREATE TABLE "RoleInvite" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "cohortId" TEXT,
  "role" TEXT NOT NULL,
  "invitedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "agencyId" TEXT,
  CONSTRAINT "RoleInvite_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoleInvite_email_idx" ON "RoleInvite"("email");
CREATE INDEX "RoleInvite_institutionId_idx" ON "RoleInvite"("institutionId");
CREATE INDEX "RoleInvite_agencyId_idx" ON "RoleInvite"("agencyId");
-- One invitation per address and place (an instructor's place includes the cohort).
CREATE UNIQUE INDEX "RoleInvite_one_per_place" ON "RoleInvite"("email", "institutionId", COALESCE("cohortId", ''));

ALTER TABLE "RoleInvite" ADD CONSTRAINT "RoleInvite_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoleInvite" ADD CONSTRAINT "RoleInvite_cohortId_fkey"
  FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The agency comes from the cohort or the institution, never from application code.
CREATE TRIGGER "RoleInvite_set_agency" BEFORE INSERT OR UPDATE ON "RoleInvite"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_cohort_or_institution"('institutionId');

-- Staff-only: only people holding a role in the invited institution's agency (the same four policies every
-- tenant table has, see 20261014110000_tenant_rls). The person invited has no access to it.
ALTER TABLE "RoleInvite" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "RoleInvite" FOR SELECT USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));
CREATE POLICY "tenant_insert" ON "RoleInvite" FOR INSERT WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));
CREATE POLICY "tenant_update" ON "RoleInvite" FOR UPDATE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]))
  WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "RoleInvite" FOR DELETE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));
