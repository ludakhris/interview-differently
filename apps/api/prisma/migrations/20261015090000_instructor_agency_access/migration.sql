-- GitHub issue #84. An instructor holds a membership with a role on one cohort. At the database level that
-- gives them their agency, like any other staff grant: the application narrows an instructor to their own
-- cohort (apps/api/src/learn/access), the database keeps them inside their agency. A learner's own
-- membership has no role, so it still grants nothing.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION "agencies_of_user"(uid TEXT) RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg(DISTINCT "agencyId"), ARRAY[]::TEXT[]) FROM "Membership"
  WHERE "userId" = uid AND "role" IS NOT NULL AND "agencyId" IS NOT NULL
$$;
