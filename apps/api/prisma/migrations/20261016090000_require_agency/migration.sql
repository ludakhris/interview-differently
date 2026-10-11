-- GitHub issue #84 (follow-up #88). Every tenant row must belong to an agency, and every provider and organization
-- must have a parent agency. Until now both were permissive so a database could be backfilled first
-- (scripts/backfill-agency-id.ts, scripts/assign-standalone-agency.ts); the triggers already fill the agency in for
-- every new row, so from here a row without one is refused.
SET lock_timeout = '5s';

-- A database that has not been backfilled gets a message that says what to do, not a constraint error.
DO $$
DECLARE
  t TEXT;
  n BIGINT;
BEGIN
  FOREACH t IN ARRAY ARRAY['Cohort', 'CohortSession', 'Enrollment', 'JoinRequest', 'Membership', 'ActivitySession', 'AttendanceMark', 'ItemProgress', 'ItemAttempt', 'PlanItem', 'ParticipantNote', 'SupportItem', 'Course', 'CourseModule', 'CourseItem', 'CourseOffer', 'RoleInvite'] LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE "agencyId" IS NULL', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION '% rows in "%" have no agency: run scripts/assign-standalone-agency.ts and scripts/backfill-agency-id.ts first', n, t;
    END IF;
  END LOOP;
  SELECT count(*) INTO n FROM "Institution" WHERE "kind" <> 'agency' AND "parentId" IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '% institutions have no parent agency: run scripts/assign-standalone-agency.ts first', n;
  END IF;
END $$;

ALTER TABLE "Institution" VALIDATE CONSTRAINT "Institution_agency_parent_check";

ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "Cohort" VALIDATE CONSTRAINT "Cohort_agency_required";
ALTER TABLE "CohortSession" ADD CONSTRAINT "CohortSession_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "CohortSession" VALIDATE CONSTRAINT "CohortSession_agency_required";
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "Enrollment" VALIDATE CONSTRAINT "Enrollment_agency_required";
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "JoinRequest" VALIDATE CONSTRAINT "JoinRequest_agency_required";
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "Membership" VALIDATE CONSTRAINT "Membership_agency_required";
ALTER TABLE "ActivitySession" ADD CONSTRAINT "ActivitySession_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "ActivitySession" VALIDATE CONSTRAINT "ActivitySession_agency_required";
ALTER TABLE "AttendanceMark" ADD CONSTRAINT "AttendanceMark_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "AttendanceMark" VALIDATE CONSTRAINT "AttendanceMark_agency_required";
ALTER TABLE "ItemProgress" ADD CONSTRAINT "ItemProgress_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "ItemProgress" VALIDATE CONSTRAINT "ItemProgress_agency_required";
ALTER TABLE "ItemAttempt" ADD CONSTRAINT "ItemAttempt_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "ItemAttempt" VALIDATE CONSTRAINT "ItemAttempt_agency_required";
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "PlanItem" VALIDATE CONSTRAINT "PlanItem_agency_required";
ALTER TABLE "ParticipantNote" ADD CONSTRAINT "ParticipantNote_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "ParticipantNote" VALIDATE CONSTRAINT "ParticipantNote_agency_required";
ALTER TABLE "SupportItem" ADD CONSTRAINT "SupportItem_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "SupportItem" VALIDATE CONSTRAINT "SupportItem_agency_required";
ALTER TABLE "Course" ADD CONSTRAINT "Course_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "Course" VALIDATE CONSTRAINT "Course_agency_required";
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "CourseModule" VALIDATE CONSTRAINT "CourseModule_agency_required";
ALTER TABLE "CourseItem" ADD CONSTRAINT "CourseItem_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "CourseItem" VALIDATE CONSTRAINT "CourseItem_agency_required";
ALTER TABLE "CourseOffer" ADD CONSTRAINT "CourseOffer_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "CourseOffer" VALIDATE CONSTRAINT "CourseOffer_agency_required";
ALTER TABLE "RoleInvite" ADD CONSTRAINT "RoleInvite_agency_required" CHECK ("agencyId" IS NOT NULL) NOT VALID;
ALTER TABLE "RoleInvite" VALIDATE CONSTRAINT "RoleInvite_agency_required";
