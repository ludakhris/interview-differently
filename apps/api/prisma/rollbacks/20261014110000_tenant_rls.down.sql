-- Undo prisma/migrations/20261014110000_tenant_rls (GitHub issue #84): policies off, helpers gone. Runs as one transaction.
BEGIN;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['Cohort','CohortSession','Enrollment','JoinRequest','Membership','ActivitySession',
    'AttendanceMark','ItemProgress','ItemAttempt','PlanItem','ParticipantNote','SupportItem','Course','CourseModule','CourseItem','CourseOffer'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_read" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_insert" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_update" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_delete" ON %I', t);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS "app_can_self_enroll"(TEXT);
DROP FUNCTION IF EXISTS "app_cohort_needs_approval"(TEXT);
DROP FUNCTION IF EXISTS "app_visible_module_ids"();
DROP FUNCTION IF EXISTS "app_visible_course_ids"();
DROP FUNCTION IF EXISTS "app_cohort_ids"();
DROP FUNCTION IF EXISTS "app_enrolled_cohort_ids"();
DROP FUNCTION IF EXISTS "app_enrollment_ids"();
DROP FUNCTION IF EXISTS "agencies_of_user"(TEXT);
DROP FUNCTION IF EXISTS "all_agency_ids"();
DROP FUNCTION IF EXISTS "app_user_id"();
DROP FUNCTION IF EXISTS "app_agency_ids"();
COMMIT;
