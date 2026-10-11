-- GitHub issue #84. An instructor's role belongs to one cohort. If the cohort is deleted the database clears
-- the membership's cohort (the learner's own membership is kept), and an instructor row left without a cohort
-- must not keep granting access to the agency.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION "agencies_of_user"(uid TEXT) RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg(DISTINCT "agencyId"), ARRAY[]::TEXT[]) FROM "Membership"
  WHERE "userId" = uid AND "role" IS NOT NULL AND "agencyId" IS NOT NULL
    AND NOT ("role" = 'instructor' AND "cohortId" IS NULL)
$$;
