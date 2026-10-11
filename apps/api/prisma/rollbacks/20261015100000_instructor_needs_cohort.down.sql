-- Undoes 20261015100000_instructor_needs_cohort: back to any role-bearing membership granting its agency.
-- Delete the row from "_prisma_migrations" afterwards.
BEGIN;
CREATE OR REPLACE FUNCTION "agencies_of_user"(uid TEXT) RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg(DISTINCT "agencyId"), ARRAY[]::TEXT[]) FROM "Membership"
  WHERE "userId" = uid AND "role" IS NOT NULL AND "agencyId" IS NOT NULL
$$;
COMMIT;
