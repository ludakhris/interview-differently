-- Undoes 20261015090000_instructor_agency_access: only memberships that are not on a cohort grant an agency again.
-- Delete the row from "_prisma_migrations" afterwards.
BEGIN;
CREATE OR REPLACE FUNCTION "agencies_of_user"(uid TEXT) RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg(DISTINCT "agencyId"), ARRAY[]::TEXT[]) FROM "Membership"
  WHERE "userId" = uid AND "role" IS NOT NULL AND "cohortId" IS NULL AND "agencyId" IS NOT NULL
$$;
COMMIT;
