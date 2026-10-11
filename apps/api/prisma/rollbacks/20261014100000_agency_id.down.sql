-- Undo prisma/migrations/20261014100000_agency_id (GitHub issue #84). Run by hand with psql or
-- `prisma db execute --file`, then delete the migration's row from "_prisma_migrations".
-- Run 20261014110000_tenant_rls.down.sql first: its policies read the columns dropped here.
-- WARNING: this drops "Membership"."role", which holds every staff grant made since the backfill (and by
-- scripts/grant-agency.ts). Export them first (SELECT "userId", "institutionId", "role" FROM "Membership" WHERE
-- "role" IS NOT NULL) if they are to be restored. Runs as one transaction.
BEGIN;
DROP TRIGGER IF EXISTS "Cohort_set_agency_course_check" ON "Cohort";
DROP FUNCTION IF EXISTS "cohort_course_allowed"();
DROP TRIGGER IF EXISTS "CourseOffer_set_agency" ON "CourseOffer";
DROP TRIGGER IF EXISTS "Course_set_agency" ON "Course";
DROP TRIGGER IF EXISTS "CourseModule_set_agency" ON "CourseModule";
DROP TRIGGER IF EXISTS "CourseItem_set_agency" ON "CourseItem";
DROP FUNCTION IF EXISTS "course_set_agency"();
DROP TRIGGER IF EXISTS "Cohort_set_agency" ON "Cohort";
DROP TRIGGER IF EXISTS "Enrollment_set_agency" ON "Enrollment";
DROP TRIGGER IF EXISTS "JoinRequest_set_agency" ON "JoinRequest";
DROP TRIGGER IF EXISTS "CohortSession_set_agency" ON "CohortSession";
DROP TRIGGER IF EXISTS "ItemProgress_set_agency" ON "ItemProgress";
DROP TRIGGER IF EXISTS "ItemAttempt_set_agency" ON "ItemAttempt";
DROP TRIGGER IF EXISTS "PlanItem_set_agency" ON "PlanItem";
DROP TRIGGER IF EXISTS "ActivitySession_set_agency" ON "ActivitySession";
DROP TRIGGER IF EXISTS "AttendanceMark_set_agency" ON "AttendanceMark";
DROP TRIGGER IF EXISTS "Membership_set_agency" ON "Membership";
DROP TRIGGER IF EXISTS "ParticipantNote_set_agency" ON "ParticipantNote";
DROP TRIGGER IF EXISTS "SupportItem_set_agency" ON "SupportItem";
DROP TRIGGER IF EXISTS "Enrollment_keys" ON "Enrollment";
DROP TRIGGER IF EXISTS "JoinRequest_keys" ON "JoinRequest";
DROP TRIGGER IF EXISTS "Membership_keys" ON "Membership";
DROP TRIGGER IF EXISTS "ItemProgress_keys" ON "ItemProgress";
DROP TRIGGER IF EXISTS "ItemAttempt_keys" ON "ItemAttempt";
DROP TRIGGER IF EXISTS "PlanItem_keys" ON "PlanItem";
DROP TRIGGER IF EXISTS "ActivitySession_keys" ON "ActivitySession";
DROP FUNCTION IF EXISTS "forbid_key_change"();
DROP FUNCTION IF EXISTS "membership_keys"();
DROP FUNCTION IF EXISTS "cohort_set_agency"();
DROP FUNCTION IF EXISTS "set_agency_from_parent"();
DROP FUNCTION IF EXISTS "set_agency_from_cohort_or_institution"();
DROP FUNCTION IF EXISTS "agency_of_institution"(TEXT);
ALTER TABLE "Cohort" DROP COLUMN IF EXISTS "agencyId";
ALTER TABLE "Enrollment" DROP COLUMN IF EXISTS "agencyId";
ALTER TABLE "JoinRequest" DROP COLUMN IF EXISTS "agencyId";
ALTER TABLE "CohortSession" DROP COLUMN IF EXISTS "agencyId";
ALTER TABLE "ItemProgress" DROP COLUMN IF EXISTS "agencyId";
ALTER TABLE "ItemAttempt" DROP COLUMN IF EXISTS "agencyId";
ALTER TABLE "PlanItem" DROP COLUMN IF EXISTS "agencyId";
ALTER TABLE "ActivitySession" DROP COLUMN IF EXISTS "agencyId";
ALTER TABLE "AttendanceMark" DROP COLUMN IF EXISTS "agencyId";
ALTER TABLE "Membership" DROP COLUMN IF EXISTS "agencyId";
ALTER TABLE "Membership" DROP COLUMN IF EXISTS "role";
ALTER TABLE "ParticipantNote" DROP COLUMN IF EXISTS "agencyId";
ALTER TABLE "SupportItem" DROP COLUMN IF EXISTS "agencyId";
ALTER TABLE "Course" DROP COLUMN IF EXISTS "agencyId";
ALTER TABLE "CourseModule" DROP COLUMN IF EXISTS "agencyId";
ALTER TABLE "CourseItem" DROP COLUMN IF EXISTS "agencyId";
ALTER TABLE "CourseOffer" DROP COLUMN IF EXISTS "agencyId";
COMMIT;
