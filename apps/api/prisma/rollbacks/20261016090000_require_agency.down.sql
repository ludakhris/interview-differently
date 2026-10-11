-- Undoes 20261016090000_require_agency: rows may be left without an agency again. The institution rule stays valid
-- (a validated constraint cannot be made unvalidated). Run it BEFORE 20261015120000_role_invite.down.sql if both are
-- being undone. Delete the row from "_prisma_migrations" afterwards.
BEGIN;
ALTER TABLE "Cohort" DROP CONSTRAINT IF EXISTS "Cohort_agency_required";
ALTER TABLE "CohortSession" DROP CONSTRAINT IF EXISTS "CohortSession_agency_required";
ALTER TABLE "Enrollment" DROP CONSTRAINT IF EXISTS "Enrollment_agency_required";
ALTER TABLE "JoinRequest" DROP CONSTRAINT IF EXISTS "JoinRequest_agency_required";
ALTER TABLE "Membership" DROP CONSTRAINT IF EXISTS "Membership_agency_required";
ALTER TABLE "ActivitySession" DROP CONSTRAINT IF EXISTS "ActivitySession_agency_required";
ALTER TABLE "AttendanceMark" DROP CONSTRAINT IF EXISTS "AttendanceMark_agency_required";
ALTER TABLE "ItemProgress" DROP CONSTRAINT IF EXISTS "ItemProgress_agency_required";
ALTER TABLE "ItemAttempt" DROP CONSTRAINT IF EXISTS "ItemAttempt_agency_required";
ALTER TABLE "PlanItem" DROP CONSTRAINT IF EXISTS "PlanItem_agency_required";
ALTER TABLE "ParticipantNote" DROP CONSTRAINT IF EXISTS "ParticipantNote_agency_required";
ALTER TABLE "SupportItem" DROP CONSTRAINT IF EXISTS "SupportItem_agency_required";
ALTER TABLE "Course" DROP CONSTRAINT IF EXISTS "Course_agency_required";
ALTER TABLE "CourseModule" DROP CONSTRAINT IF EXISTS "CourseModule_agency_required";
ALTER TABLE "CourseItem" DROP CONSTRAINT IF EXISTS "CourseItem_agency_required";
ALTER TABLE "CourseOffer" DROP CONSTRAINT IF EXISTS "CourseOffer_agency_required";
ALTER TABLE "RoleInvite" DROP CONSTRAINT IF EXISTS "RoleInvite_agency_required";
COMMIT;
