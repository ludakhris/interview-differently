-- Adaptive checkpoints (prototype): a record of what each learner did and saw, for history. Additive.
--  kind 'attempt': every answer submitted (the SQL, the result), not only the latest.
--  kind 'help':    every hint, explanation or example shown, with its text and the model that wrote it.
--  kind 'view':    light video events (start, each scene reached, replay, finish) and the voice used.
-- Learner data, so a tenant table like PlanItem (GitHub issue #84).
SET lock_timeout = '5s';

CREATE TABLE "LearnerEvent" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agencyId" TEXT,
    CONSTRAINT "LearnerEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LearnerEvent_enrollmentId_createdAt_idx" ON "LearnerEvent"("enrollmentId", "createdAt");
CREATE INDEX "LearnerEvent_itemId_idx" ON "LearnerEvent"("itemId");
CREATE INDEX "LearnerEvent_agencyId_idx" ON "LearnerEvent"("agencyId");
ALTER TABLE "LearnerEvent" ADD CONSTRAINT "LearnerEvent_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearnerEvent" ADD CONSTRAINT "LearnerEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CourseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TRIGGER "LearnerEvent_set_agency" BEFORE INSERT OR UPDATE ON "LearnerEvent"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Enrollment', 'enrollmentId');
CREATE TRIGGER "LearnerEvent_keys" BEFORE UPDATE ON "LearnerEvent"
  FOR EACH ROW EXECUTE FUNCTION "forbid_key_change"('enrollmentId');
ALTER TABLE "LearnerEvent" ADD CONSTRAINT "LearnerEvent_agency_required" CHECK ("agencyId" IS NOT NULL);

-- The agency's staff read it; a learner adds to and reads their own. Nobody but the agency deletes it.
ALTER TABLE "LearnerEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "LearnerEvent" FOR SELECT USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[]));
CREATE POLICY "tenant_insert" ON "LearnerEvent" FOR INSERT WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "enrollmentId" = ANY ((SELECT "app_enrollment_ids"())::TEXT[]));
CREATE POLICY "tenant_update" ON "LearnerEvent" FOR UPDATE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[])) WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "LearnerEvent" FOR DELETE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));
