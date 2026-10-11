-- GitHub issue #84. Deleting a cohort clears the cohort on its memberships (the learner's own membership is
-- kept). The key-change guard on Membership refused that, so a cohort with members could not be deleted. A
-- membership may now lose its cohort, but never change person or institution, or move to another cohort.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION "membership_keys"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'Column userId cannot be changed' USING ERRCODE = '23514';
  END IF;
  IF NEW."institutionId" IS DISTINCT FROM OLD."institutionId" THEN
    RAISE EXCEPTION 'Column institutionId cannot be changed' USING ERRCODE = '23514';
  END IF;
  IF NEW."cohortId" IS NOT NULL AND NEW."cohortId" IS DISTINCT FROM OLD."cohortId" THEN
    RAISE EXCEPTION 'Column cohortId cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "Membership_keys" ON "Membership";
CREATE TRIGGER "Membership_keys" BEFORE UPDATE ON "Membership"
  FOR EACH ROW EXECUTE FUNCTION "membership_keys"();
