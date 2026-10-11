-- Tenant column for database-level isolation (GitHub issue #84). The tenant is the agency, so every
-- learner-data row carries the id of the agency it belongs to. Database triggers fill it in, so
-- application code cannot forget it and cannot set it wrongly:
--   * a cohort takes the agency of the institution that runs it (or the agency its creator chose);
--   * everything that hangs off a cohort, an enrollment or a session copies it from its parent;
--   * memberships, notes and support items use their cohort when they have one, else their institution.
-- The column stays nullable here. Rows that predate it are filled by scripts/backfill-agency-id.ts
-- (run by hand), after which a later migration requires it. Until then a row whose parent has no agency yet
-- (everything that existed before this migration) simply gets no agency, rather than an error, so the deploy
-- never blocks a write to existing data; the backfill fills it, parents first.
SET lock_timeout = '10s';

-- The agency an institution belongs to: itself if it is an agency, else its parent.
CREATE FUNCTION "agency_of_institution"(inst TEXT) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN "kind" = 'agency' THEN "id" ELSE "parentId" END FROM "Institution" WHERE "id" = inst
$$;

ALTER TABLE "Cohort"          ADD COLUMN "agencyId" TEXT;
ALTER TABLE "Enrollment"      ADD COLUMN "agencyId" TEXT;
ALTER TABLE "ItemProgress"    ADD COLUMN "agencyId" TEXT;
ALTER TABLE "ItemAttempt"     ADD COLUMN "agencyId" TEXT;
ALTER TABLE "PlanItem"        ADD COLUMN "agencyId" TEXT;
ALTER TABLE "ActivitySession" ADD COLUMN "agencyId" TEXT;
ALTER TABLE "JoinRequest"     ADD COLUMN "agencyId" TEXT;
ALTER TABLE "CohortSession"   ADD COLUMN "agencyId" TEXT;
ALTER TABLE "AttendanceMark"  ADD COLUMN "agencyId" TEXT;
ALTER TABLE "Membership"      ADD COLUMN "agencyId" TEXT;
-- A grant: a membership with a role is a staff grant that gives its holder the agency's data; one without is plain
-- membership (a learner in a cohort). Only grants count as a person's agencies (agencies_of_user).
ALTER TABLE "Membership"      ADD COLUMN "role" TEXT;
ALTER TABLE "ParticipantNote" ADD COLUMN "agencyId" TEXT;
ALTER TABLE "SupportItem"     ADD COLUMN "agencyId" TEXT;
ALTER TABLE "Course"          ADD COLUMN "agencyId" TEXT;
ALTER TABLE "CourseModule"    ADD COLUMN "agencyId" TEXT;
ALTER TABLE "CourseItem"      ADD COLUMN "agencyId" TEXT;
ALTER TABLE "CourseOffer"     ADD COLUMN "agencyId" TEXT;

CREATE INDEX "Cohort_agencyId_idx"          ON "Cohort"("agencyId");
CREATE INDEX "Enrollment_agencyId_idx"      ON "Enrollment"("agencyId");
CREATE INDEX "ItemProgress_agencyId_idx"    ON "ItemProgress"("agencyId");
CREATE INDEX "ItemAttempt_agencyId_idx"     ON "ItemAttempt"("agencyId");
CREATE INDEX "PlanItem_agencyId_idx"        ON "PlanItem"("agencyId");
CREATE INDEX "ActivitySession_agencyId_idx" ON "ActivitySession"("agencyId");
CREATE INDEX "JoinRequest_agencyId_idx"     ON "JoinRequest"("agencyId");
CREATE INDEX "CohortSession_agencyId_idx"   ON "CohortSession"("agencyId");
CREATE INDEX "AttendanceMark_agencyId_idx"  ON "AttendanceMark"("agencyId");
CREATE INDEX "Membership_agencyId_idx"      ON "Membership"("agencyId");
CREATE INDEX "ParticipantNote_agencyId_idx" ON "ParticipantNote"("agencyId");
CREATE INDEX "SupportItem_agencyId_idx"     ON "SupportItem"("agencyId");
CREATE INDEX "Course_agencyId_idx"          ON "Course"("agencyId");
CREATE INDEX "CourseModule_agencyId_idx"    ON "CourseModule"("agencyId");
CREATE INDEX "CourseItem_agencyId_idx"      ON "CourseItem"("agencyId");
CREATE INDEX "CourseOffer_agencyId_idx"     ON "CourseOffer"("agencyId");

-- A course belongs to the agency of its provider: private to it, with its modules and items.
CREATE FUNCTION "course_set_agency"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW."agencyId" := "agency_of_institution"(NEW."providerId");
  RETURN NEW;
END $$;

CREATE TRIGGER "Course_set_agency" BEFORE INSERT OR UPDATE ON "Course"
  FOR EACH ROW EXECUTE FUNCTION "course_set_agency"();

-- Cohort: the creator may name the agency (a provider that works with several agencies picks one);
-- otherwise it is the agency of the institution that runs the cohort. It cannot change afterwards:
-- everything under the cohort has copied it.
CREATE FUNCTION "cohort_set_agency"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."agencyId" IS NOT NULL AND NEW."agencyId" IS DISTINCT FROM OLD."agencyId" THEN
    RAISE EXCEPTION 'A cohort cannot move to another agency' USING ERRCODE = '23514';
  END IF;
  NEW."agencyId" := COALESCE(NEW."agencyId", "agency_of_institution"(NEW."institutionId"));
  RETURN NEW;
END $$;

CREATE TRIGGER "Cohort_set_agency" BEFORE INSERT OR UPDATE ON "Cohort"
  FOR EACH ROW EXECUTE FUNCTION "cohort_set_agency"();

-- Rows that hang off one parent copy its agency. Arguments: the parent table and the column that
-- points at it. The value is always the parent's, whatever the caller passed (null while the parent has none yet).
CREATE FUNCTION "set_agency_from_parent"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  found TEXT;
BEGIN
  EXECUTE format('SELECT "agencyId" FROM %I WHERE "id" = $1', TG_ARGV[0]) INTO found USING to_jsonb(NEW) ->> TG_ARGV[1];
  NEW."agencyId" := found;
  RETURN NEW;
END $$;

CREATE TRIGGER "Enrollment_set_agency"      BEFORE INSERT OR UPDATE ON "Enrollment"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Cohort', 'cohortId');
CREATE TRIGGER "JoinRequest_set_agency"     BEFORE INSERT OR UPDATE ON "JoinRequest"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Cohort', 'cohortId');
CREATE TRIGGER "CohortSession_set_agency"   BEFORE INSERT OR UPDATE ON "CohortSession"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Cohort', 'cohortId');
CREATE TRIGGER "ItemProgress_set_agency"    BEFORE INSERT OR UPDATE ON "ItemProgress"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Enrollment', 'enrollmentId');
CREATE TRIGGER "ItemAttempt_set_agency"     BEFORE INSERT OR UPDATE ON "ItemAttempt"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Enrollment', 'enrollmentId');
CREATE TRIGGER "PlanItem_set_agency"        BEFORE INSERT OR UPDATE ON "PlanItem"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Enrollment', 'enrollmentId');
CREATE TRIGGER "ActivitySession_set_agency" BEFORE INSERT OR UPDATE ON "ActivitySession"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Enrollment', 'enrollmentId');
CREATE TRIGGER "AttendanceMark_set_agency"  BEFORE INSERT OR UPDATE ON "AttendanceMark"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('CohortSession', 'sessionId');
CREATE TRIGGER "CourseModule_set_agency"   BEFORE INSERT OR UPDATE ON "CourseModule"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Course', 'courseId');
CREATE TRIGGER "CourseItem_set_agency"     BEFORE INSERT OR UPDATE ON "CourseItem"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('CourseModule', 'moduleId');
-- An offer belongs to the agency of the course being offered (its owner decides who may run it).
CREATE TRIGGER "CourseOffer_set_agency"    BEFORE INSERT OR UPDATE ON "CourseOffer"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Course', 'courseId');

-- Rows with an optional cohort and an institution: the cohort's agency if there is a cohort, else the
-- institution's. Argument: the institution column.
CREATE FUNCTION "set_agency_from_cohort_or_institution"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW."cohortId" IS NOT NULL THEN
    SELECT "agencyId" INTO NEW."agencyId" FROM "Cohort" WHERE "id" = NEW."cohortId";
  ELSE
    NEW."agencyId" := "agency_of_institution"(to_jsonb(NEW) ->> TG_ARGV[0]);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Membership_set_agency"      BEFORE INSERT OR UPDATE ON "Membership"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_cohort_or_institution"('institutionId');
CREATE TRIGGER "ParticipantNote_set_agency" BEFORE INSERT OR UPDATE ON "ParticipantNote"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_cohort_or_institution"('providerId');
CREATE TRIGGER "SupportItem_set_agency"     BEFORE INSERT OR UPDATE ON "SupportItem"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_cohort_or_institution"('providerId');

-- What a row belongs to cannot be re-pointed: someone who may edit their own row must not be able to move it
-- into another cohort (and so another agency). Arguments: the columns that may not change.
CREATE FUNCTION "forbid_key_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  col TEXT;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF to_jsonb(NEW) ->> col IS DISTINCT FROM to_jsonb(OLD) ->> col THEN
      RAISE EXCEPTION 'Column % cannot be changed', col USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER "Enrollment_keys"      BEFORE UPDATE ON "Enrollment"
  FOR EACH ROW EXECUTE FUNCTION "forbid_key_change"('cohortId', 'userId');
CREATE TRIGGER "JoinRequest_keys"     BEFORE UPDATE ON "JoinRequest"
  FOR EACH ROW EXECUTE FUNCTION "forbid_key_change"('cohortId', 'userId');
CREATE TRIGGER "Membership_keys"      BEFORE UPDATE ON "Membership"
  FOR EACH ROW EXECUTE FUNCTION "forbid_key_change"('userId', 'institutionId', 'cohortId');
CREATE TRIGGER "ItemProgress_keys"    BEFORE UPDATE ON "ItemProgress"
  FOR EACH ROW EXECUTE FUNCTION "forbid_key_change"('enrollmentId');
CREATE TRIGGER "ItemAttempt_keys"     BEFORE UPDATE ON "ItemAttempt"
  FOR EACH ROW EXECUTE FUNCTION "forbid_key_change"('enrollmentId');
CREATE TRIGGER "PlanItem_keys"        BEFORE UPDATE ON "PlanItem"
  FOR EACH ROW EXECUTE FUNCTION "forbid_key_change"('enrollmentId');
CREATE TRIGGER "ActivitySession_keys" BEFORE UPDATE ON "ActivitySession"
  FOR EACH ROW EXECUTE FUNCTION "forbid_key_change"('enrollmentId', 'userId');

-- The lookup helper reads every institution; only the trigger functions (which run as their owner) and the
-- migration role need it.
REVOKE ALL ON FUNCTION "agency_of_institution"(TEXT) FROM PUBLIC;

-- A cohort runs a course of its own agency, or one offered to the institution that runs it. Without this, a
-- cohort could be pointed at another agency's course and so read it. Rows that predate the agency columns
-- (null on either side) are left alone until the backfill. The name sorts after Cohort_set_agency, so the cohort's
-- agency is set before this looks at it.
CREATE FUNCTION "cohort_course_allowed"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  course_agency TEXT;
BEGIN
  IF NEW."courseId" IS NULL OR NEW."agencyId" IS NULL THEN RETURN NEW; END IF;
  SELECT "agencyId" INTO course_agency FROM "Course" WHERE "id" = NEW."courseId";
  IF course_agency IS NULL OR course_agency = NEW."agencyId"
     OR EXISTS (SELECT 1 FROM "CourseOffer" WHERE "courseId" = NEW."courseId" AND "institutionId" = NEW."institutionId") THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'This course belongs to another agency and has not been offered to this institution' USING ERRCODE = '23514';
END $$;

CREATE TRIGGER "Cohort_set_agency_course_check" BEFORE INSERT OR UPDATE OF "courseId", "institutionId", "agencyId" ON "Cohort"
  FOR EACH ROW EXECUTE FUNCTION "cohort_course_allowed"();
