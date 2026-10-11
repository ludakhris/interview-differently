-- Row-level security for tenant isolation (GitHub issue #84). Every query the API makes carries two
-- transaction-local settings:
--   app.agency_ids  the agencies the caller may work in (comma separated)
--   app.user_id     who the caller is
-- A row is visible when its agencyId is one of the caller's agencies, or when it is the caller's own
-- (or hangs off something that is). With no settings the caller sees nothing.
--
-- Superusers, roles with BYPASSRLS and (because the tables are not FORCEd) the tables' owner are never subject
-- to policies, so these policies only bind the restricted role the API connects as
-- (scripts/create-app-role.ts). Migrations, seeds and scripts that run as the owner are unaffected, and the API
-- checks at startup which role it connected as (REQUIRE_TENANT_RLS=on refuses to run as one that bypasses them).
SET lock_timeout = '10s';

-- Nothing the restricted role can create in its own session may stand in for a real table or function.
DO $$ BEGIN EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database()); END $$;

CREATE FUNCTION "app_agency_ids"() RETURNS TEXT[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(string_to_array(NULLIF(current_setting('app.agency_ids', true), ''), ','), ARRAY[]::TEXT[])
$$;

CREATE FUNCTION "app_user_id"() RETURNS TEXT
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '') $$;

-- Every agency: what system administrators and trusted background work are given.
CREATE FUNCTION "all_agency_ids"() RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg("id"), ARRAY[]::TEXT[]) FROM "Institution" WHERE "kind" = 'agency'
$$;

-- The agencies a person holds a staff grant in: a workspace-level membership that has a role.
CREATE FUNCTION "agencies_of_user"(uid TEXT) RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg(DISTINCT "agencyId"), ARRAY[]::TEXT[]) FROM "Membership"
  WHERE "userId" = uid AND "role" IS NOT NULL AND "cohortId" IS NULL AND "agencyId" IS NOT NULL
$$;

CREATE FUNCTION "app_enrollment_ids"() RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg("id"), ARRAY[]::TEXT[]) FROM "Enrollment" WHERE "userId" = "app_user_id"()
$$;

-- The cohorts the caller is enrolled in.
CREATE FUNCTION "app_enrolled_cohort_ids"() RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg("cohortId"), ARRAY[]::TEXT[]) FROM "Enrollment" WHERE "userId" = "app_user_id"()
$$;

-- The cohorts the caller can see as themselves: enrolled in, asked to join, or a member of.
CREATE FUNCTION "app_cohort_ids"() RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg(DISTINCT c), ARRAY[]::TEXT[]) FROM (
    SELECT "cohortId" AS c FROM "Enrollment" WHERE "userId" = "app_user_id"()
    UNION ALL SELECT "cohortId" FROM "JoinRequest" WHERE "userId" = "app_user_id"()
    UNION ALL SELECT "cohortId" FROM "Membership" WHERE "userId" = "app_user_id"() AND "cohortId" IS NOT NULL
  ) t
$$;

-- Whether a person may put themselves in this cohort without anyone's approval: it does not need approval and
-- it has room. (Joining by code still decides which cohort; this only stops the database accepting a self-enrolment
-- that skips approval or capacity.)
CREATE FUNCTION "app_can_self_enroll"(cohort TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((
    SELECT NOT c."requiresApproval" AND (
      c."maxLearners" IS NULL
      OR (SELECT count(*) FROM "Enrollment" e WHERE e."cohortId" = c."id" AND e."status" <> 'withdrawn') < c."maxLearners"
    )
    FROM "Cohort" c WHERE c."id" = cohort
  ), false)
$$;

-- Whether this cohort asks people to request to join (so a join request, not an enrolment, is what they may add).
CREATE FUNCTION "app_cohort_needs_approval"(cohort TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT c."requiresApproval" FROM "Cohort" c WHERE c."id" = cohort), false)
$$;

-- The courses the caller may see: their agency's, those offered to an institution of their agency, and those run
-- by a cohort they can see (so a learner reads the course they are enrolled in, and an organization in another
-- agency reads a course it runs). Everything else is private to the course's agency.
CREATE FUNCTION "app_visible_course_ids"() RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg(DISTINCT c), ARRAY[]::TEXT[]) FROM (
    SELECT "id" AS c FROM "Course" WHERE "agencyId" = ANY ("app_agency_ids"())
    UNION ALL
    SELECT o."courseId" FROM "CourseOffer" o WHERE "agency_of_institution"(o."institutionId") = ANY ("app_agency_ids"())
    UNION ALL
    SELECT "courseId" FROM "Cohort"
      WHERE "courseId" IS NOT NULL AND ("agencyId" = ANY ("app_agency_ids"()) OR "id" = ANY ("app_cohort_ids"()))
  ) t
$$;

CREATE FUNCTION "app_visible_module_ids"() RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg("id"), ARRAY[]::TEXT[]) FROM "CourseModule"
  WHERE "courseId" = ANY ("app_visible_course_ids"())
$$;

-- These read every agency, so they are not for the restricted role to call on its own: it gets EXECUTE on
-- them through scripts/create-app-role.ts, which is the only place that decides what that role may do.
REVOKE ALL ON FUNCTION "all_agency_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "agencies_of_user"(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "app_enrollment_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "app_enrolled_cohort_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "app_cohort_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "app_can_self_enroll"(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "app_cohort_needs_approval"(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "app_visible_course_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "app_visible_module_ids"() FROM PUBLIC;

-- The context functions are wrapped in (SELECT ...) so Postgres evaluates them once per statement, not once per
-- row (an initPlan); they never depend on the row being checked.
--
-- One set of policies per table:
--   read    a row is visible to its agency, and to the person it belongs to (`read_own`);
--   write   insert and update need the row's agency, or `write_own` (rows a person makes about themselves);
--   delete  only the row's agency.
-- Being enrolled in a cohort lets a learner SEE it and their own records, never change or remove them.
CREATE FUNCTION "create_tenant_policies"(tbl TEXT, read_own TEXT, insert_own TEXT, update_own TEXT) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  agency TEXT := '"agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[])';
  r TEXT := agency || CASE WHEN read_own = '' THEN '' ELSE ' OR ' || read_own END;
  i TEXT := agency || CASE WHEN insert_own = '' THEN '' ELSE ' OR ' || insert_own END;
  u TEXT := agency || CASE WHEN update_own = '' THEN '' ELSE ' OR ' || update_own END;
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('CREATE POLICY "tenant_read" ON %I FOR SELECT USING (%s)', tbl, r);
  EXECUTE format('CREATE POLICY "tenant_insert" ON %I FOR INSERT WITH CHECK (%s)', tbl, i);
  EXECUTE format('CREATE POLICY "tenant_update" ON %I FOR UPDATE USING (%s) WITH CHECK (%s)', tbl, u, u);
  EXECUTE format('CREATE POLICY "tenant_delete" ON %I FOR DELETE USING (%s)', tbl, agency);
END $$;

SELECT "create_tenant_policies"('Cohort', '"id" = ANY ((SELECT "app_cohort_ids"())::TEXT[])', '', '');
SELECT "create_tenant_policies"('CohortSession',
  '"cohortId" = ANY ((SELECT "app_enrolled_cohort_ids"())::TEXT[])', '', '');
-- A person may enrol themselves only where no approval is needed and there is room, ask to join only where approval
-- is needed, and change what is theirs afterwards. They may add or change their own plain membership, never one that
-- carries a role (a grant), and a cohort membership only where they could enrol.
SELECT "create_tenant_policies"('Enrollment', '"userId" = (SELECT "app_user_id"())',
  '"userId" = (SELECT "app_user_id"()) AND "app_can_self_enroll"("cohortId")', '"userId" = (SELECT "app_user_id"())');
SELECT "create_tenant_policies"('JoinRequest', '"userId" = (SELECT "app_user_id"())',
  '"userId" = (SELECT "app_user_id"()) AND "app_cohort_needs_approval"("cohortId")', '"userId" = (SELECT "app_user_id"())');
SELECT "create_tenant_policies"('Membership', '"userId" = (SELECT "app_user_id"())',
  '"userId" = (SELECT "app_user_id"()) AND "role" IS NULL AND ("cohortId" IS NULL OR "app_can_self_enroll"("cohortId"))',
  '"userId" = (SELECT "app_user_id"()) AND "role" IS NULL');
-- Activity is logged against the person's own enrolment, and only theirs.
SELECT "create_tenant_policies"('ActivitySession', '"userId" = (SELECT "app_user_id"())',
  '"userId" = (SELECT "app_user_id"()) AND "enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[])',
  '"userId" = (SELECT "app_user_id"()) AND "enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[])');
SELECT "create_tenant_policies"('AttendanceMark', '"userId" = (SELECT "app_user_id"())', '', '');
-- Progress, attempts and the plan belong to an enrollment, so they are the learner's through it.
SELECT "create_tenant_policies"('ItemProgress',
  '"enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[])',
  '"enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[])',
  '"enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[])');
SELECT "create_tenant_policies"('ItemAttempt',
  '"enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[])',
  '"enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[])',
  '"enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[])');
SELECT "create_tenant_policies"('PlanItem',
  '"enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[])',
  '"enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[])',
  '"enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[])');
-- Staff-only: only people in the agency.
SELECT "create_tenant_policies"('ParticipantNote', '', '', '');
SELECT "create_tenant_policies"('SupportItem', '', '', '');
-- Courses are private to their agency; the helpers add the courses a caller runs, is offered or is enrolled in.
-- Only the agency's staff write them.
SELECT "create_tenant_policies"('Course', '"id" = ANY ((SELECT "app_visible_course_ids"())::TEXT[])', '', '');
SELECT "create_tenant_policies"('CourseModule', '"id" = ANY ((SELECT "app_visible_module_ids"())::TEXT[])', '', '');
SELECT "create_tenant_policies"('CourseItem', '"moduleId" = ANY ((SELECT "app_visible_module_ids"())::TEXT[])', '', '');

-- An offer is the course's agency's decision: it is visible to that agency and to the institutions it is offered to,
-- and only the course's agency changes it.
SELECT "create_tenant_policies"('CourseOffer',
  '"institutionId" IN (SELECT i."id" FROM "Institution" i WHERE i."id" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR i."parentId" = ANY ((SELECT "app_agency_ids"())::TEXT[]))',
  '', '');

DROP FUNCTION "create_tenant_policies"(TEXT, TEXT, TEXT, TEXT);
