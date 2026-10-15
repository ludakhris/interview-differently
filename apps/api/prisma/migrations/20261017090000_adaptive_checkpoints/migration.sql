-- Adaptive learning checkpoints (prototype). Additive: no existing column or row changes.
--  - Course.adaptive: the course's adaptive rules, { testOut, approveGenerated }.
--  - PlanSkip: course content a learner was let past because they showed the skill it teaches.
--  - GeneratedPractice: practice the Simulator generated for one learner's gap, and its review.
-- Both tables hold learner data, so they are tenant tables like PlanItem (GitHub issue #84).
SET lock_timeout = '5s';

ALTER TABLE "Course" ADD COLUMN "adaptive" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "PlanSkip" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "reason" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agencyId" TEXT,
    CONSTRAINT "PlanSkip_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlanSkip_enrollmentId_itemId_key" ON "PlanSkip"("enrollmentId", "itemId");
CREATE INDEX "PlanSkip_itemId_idx" ON "PlanSkip"("itemId");
CREATE INDEX "PlanSkip_agencyId_idx" ON "PlanSkip"("agencyId");
ALTER TABLE "PlanSkip" ADD CONSTRAINT "PlanSkip_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanSkip" ADD CONSTRAINT "PlanSkip_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CourseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GeneratedPractice" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "intro" TEXT NOT NULL,
    "tasks" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agencyId" TEXT,
    CONSTRAINT "GeneratedPractice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GeneratedPractice_enrollmentId_itemId_idx" ON "GeneratedPractice"("enrollmentId", "itemId");
CREATE INDEX "GeneratedPractice_itemId_idx" ON "GeneratedPractice"("itemId");
CREATE INDEX "GeneratedPractice_agencyId_idx" ON "GeneratedPractice"("agencyId");
ALTER TABLE "GeneratedPractice" ADD CONSTRAINT "GeneratedPractice_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedPractice" ADD CONSTRAINT "GeneratedPractice_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CourseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The agency comes from the enrollment, never from application code, and the keys never move.
CREATE TRIGGER "PlanSkip_set_agency" BEFORE INSERT OR UPDATE ON "PlanSkip"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Enrollment', 'enrollmentId');
CREATE TRIGGER "GeneratedPractice_set_agency" BEFORE INSERT OR UPDATE ON "GeneratedPractice"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Enrollment', 'enrollmentId');
CREATE TRIGGER "PlanSkip_keys" BEFORE UPDATE ON "PlanSkip"
  FOR EACH ROW EXECUTE FUNCTION "forbid_key_change"('enrollmentId');
CREATE TRIGGER "GeneratedPractice_keys" BEFORE UPDATE ON "GeneratedPractice"
  FOR EACH ROW EXECUTE FUNCTION "forbid_key_change"('enrollmentId');

ALTER TABLE "PlanSkip" ADD CONSTRAINT "PlanSkip_agency_required" CHECK ("agencyId" IS NOT NULL);
ALTER TABLE "GeneratedPractice" ADD CONSTRAINT "GeneratedPractice_agency_required" CHECK ("agencyId" IS NOT NULL);

-- Like PlanItem: the agency's staff, and the learner through their own enrollment.
ALTER TABLE "PlanSkip" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "PlanSkip" FOR SELECT USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[]));
CREATE POLICY "tenant_insert" ON "PlanSkip" FOR INSERT WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[]));
CREATE POLICY "tenant_update" ON "PlanSkip" FOR UPDATE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[])) WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "PlanSkip" FOR DELETE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));

ALTER TABLE "GeneratedPractice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "GeneratedPractice" FOR SELECT USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[]));
CREATE POLICY "tenant_insert" ON "GeneratedPractice" FOR INSERT WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[]));
CREATE POLICY "tenant_update" ON "GeneratedPractice" FOR UPDATE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[])) WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "GeneratedPractice" FOR DELETE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));
