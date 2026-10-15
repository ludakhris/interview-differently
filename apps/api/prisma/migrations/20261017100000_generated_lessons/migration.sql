-- Adaptive checkpoints (prototype): short lessons Micro Learning (Spark) writes for one learner's gap, played as a
-- narrated storyboard. Additive. Learner data, so a tenant table like PlanItem (GitHub issue #84).
SET lock_timeout = '5s';

CREATE TABLE "GeneratedLesson" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "title" TEXT NOT NULL,
    "scenes" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agencyId" TEXT,
    CONSTRAINT "GeneratedLesson_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GeneratedLesson_enrollmentId_itemId_idx" ON "GeneratedLesson"("enrollmentId", "itemId");
CREATE INDEX "GeneratedLesson_itemId_idx" ON "GeneratedLesson"("itemId");
CREATE INDEX "GeneratedLesson_agencyId_idx" ON "GeneratedLesson"("agencyId");
ALTER TABLE "GeneratedLesson" ADD CONSTRAINT "GeneratedLesson_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedLesson" ADD CONSTRAINT "GeneratedLesson_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CourseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TRIGGER "GeneratedLesson_set_agency" BEFORE INSERT OR UPDATE ON "GeneratedLesson"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Enrollment', 'enrollmentId');
CREATE TRIGGER "GeneratedLesson_keys" BEFORE UPDATE ON "GeneratedLesson"
  FOR EACH ROW EXECUTE FUNCTION "forbid_key_change"('enrollmentId');
ALTER TABLE "GeneratedLesson" ADD CONSTRAINT "GeneratedLesson_agency_required" CHECK ("agencyId" IS NOT NULL);

ALTER TABLE "GeneratedLesson" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "GeneratedLesson" FOR SELECT USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[]));
CREATE POLICY "tenant_insert" ON "GeneratedLesson" FOR INSERT WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[]));
CREATE POLICY "tenant_update" ON "GeneratedLesson" FOR UPDATE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[])) WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "GeneratedLesson" FOR DELETE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));
