-- Relax uniqueness for #14:
--   1. Institution.emailDomain is no longer unique — multiple institutions
--      can share a parent domain; suggestion picks the longest match.
--   2. Cohort.joinKey is no longer globally unique — only unique within
--      a single institution, so two schools can both use "fall2026".

-- DropIndex (Institution.emailDomain unique)
DROP INDEX "Institution_emailDomain_key";

-- The plain index already exists from the original migration ("Institution_emailDomain_idx"
-- was implied by the unique). Recreate it explicitly so the DB matches the schema.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'Institution_emailDomain_idx'
  ) THEN
    CREATE INDEX "Institution_emailDomain_idx" ON "Institution"("emailDomain");
  END IF;
END $$;

-- DropIndex (Cohort.joinKey global unique)
DROP INDEX "Cohort_joinKey_key";

-- CreateIndex (per-institution composite unique + plain index for lookups)
CREATE INDEX "Cohort_joinKey_idx" ON "Cohort"("joinKey");
CREATE UNIQUE INDEX "Cohort_institutionId_joinKey_key" ON "Cohort"("institutionId", "joinKey");
