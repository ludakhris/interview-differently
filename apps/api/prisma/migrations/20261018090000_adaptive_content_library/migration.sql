-- Adaptive checkpoints move to their products (GitHub issue #90).
--  * AI-written content becomes ours: library rows with no tie to a learner, course or provider, so they outlive all
--    three, carrying the metadata a content library needs (model, prompt version, source, token counts). Simulator
--    practice is "PracticeSet", Spark lessons are "Lesson". A learner's use of a row is a separate tenant row.
--  * What a learner did in a checkpoint is Simulator data ("PracticeEvent"); what they watched is Spark data
--    ("LessonEvent"). They replace the LMS prototype's "LearnerEvent".
--  * An Interview Differently delivery can carry the checkpoint's placement ("config": chat format, question refs).
-- The prototype tables were only ever on the dev database; their generated content is copied into the library.
SET lock_timeout = '5s';

ALTER TABLE "AssessmentDelivery" ADD COLUMN "config" JSONB;

-- ── Simulator: generated practice (library) ──────────────────────────────────
CREATE TABLE "PracticeSet" (
    "id" TEXT NOT NULL,
    "bankSlug" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "tasks" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cacheReadTokens" INTEGER,
    "cacheWriteTokens" INTEGER,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PracticeSet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PracticeSet_bankSlug_skill_status_idx" ON "PracticeSet"("bankSlug", "skill", "status");

-- ── Spark: generated lessons (library) ───────────────────────────────────────
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "level" TEXT,
    "title" TEXT NOT NULL,
    "scenes" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cacheReadTokens" INTEGER,
    "cacheWriteTokens" INTEGER,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Lesson_skill_status_idx" ON "Lesson"("skill", "status");

-- ── Tenant rows: a learner's use of library content, and what they did ──────
-- Each points at a cohort (as Simulator and Spark rows may) and takes its agency from it.
CREATE TABLE "PracticeSetUse" (
    "id" TEXT NOT NULL,
    "practiceSetId" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agencyId" TEXT,
    CONSTRAINT "PracticeSetUse_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PracticeSetUse_cohortId_userId_itemId_idx" ON "PracticeSetUse"("cohortId", "userId", "itemId");
CREATE INDEX "PracticeSetUse_practiceSetId_idx" ON "PracticeSetUse"("practiceSetId");
CREATE INDEX "PracticeSetUse_agencyId_idx" ON "PracticeSetUse"("agencyId");
ALTER TABLE "PracticeSetUse" ADD CONSTRAINT "PracticeSetUse_practiceSetId_fkey" FOREIGN KEY ("practiceSetId") REFERENCES "PracticeSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PracticeSetUse" ADD CONSTRAINT "PracticeSetUse_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PracticeEvent" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "kind" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "correct" BOOLEAN,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agencyId" TEXT,
    CONSTRAINT "PracticeEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PracticeEvent_cohortId_userId_createdAt_idx" ON "PracticeEvent"("cohortId", "userId", "createdAt");
CREATE INDEX "PracticeEvent_deliveryId_idx" ON "PracticeEvent"("deliveryId");
CREATE INDEX "PracticeEvent_agencyId_idx" ON "PracticeEvent"("agencyId");
ALTER TABLE "PracticeEvent" ADD CONSTRAINT "PracticeEvent_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeEvent" ADD CONSTRAINT "PracticeEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "AssessmentDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LessonUse" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agencyId" TEXT,
    CONSTRAINT "LessonUse_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LessonUse_cohortId_userId_itemId_idx" ON "LessonUse"("cohortId", "userId", "itemId");
CREATE INDEX "LessonUse_lessonId_idx" ON "LessonUse"("lessonId");
CREATE INDEX "LessonUse_agencyId_idx" ON "LessonUse"("agencyId");
ALTER TABLE "LessonUse" ADD CONSTRAINT "LessonUse_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LessonUse" ADD CONSTRAINT "LessonUse_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LessonEvent" (
    "id" TEXT NOT NULL,
    "lessonUseId" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agencyId" TEXT,
    CONSTRAINT "LessonEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LessonEvent_lessonUseId_createdAt_idx" ON "LessonEvent"("lessonUseId", "createdAt");
CREATE INDEX "LessonEvent_cohortId_userId_idx" ON "LessonEvent"("cohortId", "userId");
CREATE INDEX "LessonEvent_agencyId_idx" ON "LessonEvent"("agencyId");
ALTER TABLE "LessonEvent" ADD CONSTRAINT "LessonEvent_lessonUseId_fkey" FOREIGN KEY ("lessonUseId") REFERENCES "LessonUse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonEvent" ADD CONSTRAINT "LessonEvent_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Agency from the cohort; the keys never change; the agency is required. The agency's staff read and manage them; a
-- learner reads and adds their own (an LTI launch identifies them as the user).
CREATE TRIGGER "PracticeSetUse_set_agency" BEFORE INSERT OR UPDATE ON "PracticeSetUse"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Cohort', 'cohortId');
CREATE TRIGGER "PracticeSetUse_keys" BEFORE UPDATE ON "PracticeSetUse"
  FOR EACH ROW EXECUTE FUNCTION "forbid_key_change"('cohortId');
ALTER TABLE "PracticeSetUse" ADD CONSTRAINT "PracticeSetUse_agency_required" CHECK ("agencyId" IS NOT NULL);
ALTER TABLE "PracticeSetUse" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "PracticeSetUse" FOR SELECT USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "userId" = (SELECT "app_user_id"()));
CREATE POLICY "tenant_insert" ON "PracticeSetUse" FOR INSERT WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "userId" = (SELECT "app_user_id"()));
CREATE POLICY "tenant_update" ON "PracticeSetUse" FOR UPDATE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[])) WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "PracticeSetUse" FOR DELETE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));

CREATE TRIGGER "PracticeEvent_set_agency" BEFORE INSERT OR UPDATE ON "PracticeEvent"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Cohort', 'cohortId');
CREATE TRIGGER "PracticeEvent_keys" BEFORE UPDATE ON "PracticeEvent"
  FOR EACH ROW EXECUTE FUNCTION "forbid_key_change"('cohortId');
ALTER TABLE "PracticeEvent" ADD CONSTRAINT "PracticeEvent_agency_required" CHECK ("agencyId" IS NOT NULL);
ALTER TABLE "PracticeEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "PracticeEvent" FOR SELECT USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "userId" = (SELECT "app_user_id"()));
CREATE POLICY "tenant_insert" ON "PracticeEvent" FOR INSERT WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "userId" = (SELECT "app_user_id"()));
CREATE POLICY "tenant_update" ON "PracticeEvent" FOR UPDATE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[])) WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "PracticeEvent" FOR DELETE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));

CREATE TRIGGER "LessonUse_set_agency" BEFORE INSERT OR UPDATE ON "LessonUse"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Cohort', 'cohortId');
CREATE TRIGGER "LessonUse_keys" BEFORE UPDATE ON "LessonUse"
  FOR EACH ROW EXECUTE FUNCTION "forbid_key_change"('cohortId');
ALTER TABLE "LessonUse" ADD CONSTRAINT "LessonUse_agency_required" CHECK ("agencyId" IS NOT NULL);
ALTER TABLE "LessonUse" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "LessonUse" FOR SELECT USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "userId" = (SELECT "app_user_id"()));
CREATE POLICY "tenant_insert" ON "LessonUse" FOR INSERT WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "userId" = (SELECT "app_user_id"()));
CREATE POLICY "tenant_update" ON "LessonUse" FOR UPDATE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[])) WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "LessonUse" FOR DELETE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));

CREATE TRIGGER "LessonEvent_set_agency" BEFORE INSERT OR UPDATE ON "LessonEvent"
  FOR EACH ROW EXECUTE FUNCTION "set_agency_from_parent"('Cohort', 'cohortId');
CREATE TRIGGER "LessonEvent_keys" BEFORE UPDATE ON "LessonEvent"
  FOR EACH ROW EXECUTE FUNCTION "forbid_key_change"('cohortId');
ALTER TABLE "LessonEvent" ADD CONSTRAINT "LessonEvent_agency_required" CHECK ("agencyId" IS NOT NULL);
ALTER TABLE "LessonEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "LessonEvent" FOR SELECT USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "userId" = (SELECT "app_user_id"()));
CREATE POLICY "tenant_insert" ON "LessonEvent" FOR INSERT WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]) OR "userId" = (SELECT "app_user_id"()));
CREATE POLICY "tenant_update" ON "LessonEvent" FOR UPDATE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[])) WITH CHECK ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));
CREATE POLICY "tenant_delete" ON "LessonEvent" FOR DELETE USING ("agencyId" = ANY ((SELECT "app_agency_ids"())::TEXT[]));

-- ── Keep what the prototype generated, as library content ───────────────────
INSERT INTO "PracticeSet" ("id", "bankSlug", "skill", "intro", "tasks", "status", "model", "promptVersion", "reviewedBy", "reviewedAt", "createdAt")
SELECT g."id", COALESCE(i."config"->>'bank', ''),
       COALESCE((SELECT s->>'label' FROM jsonb_array_elements(c."skills") s WHERE s->>'id' = g."skill" LIMIT 1), g."skill"),
       g."intro", g."tasks", g."status", g."model", 'prototype', g."reviewedBy", g."reviewedAt", g."createdAt"
FROM "GeneratedPractice" g
JOIN "CourseItem" i ON i."id" = g."itemId"
JOIN "CourseModule" m ON m."id" = i."moduleId"
JOIN "Course" c ON c."id" = m."courseId";

INSERT INTO "Lesson" ("id", "skill", "level", "title", "scenes", "status", "model", "promptVersion", "reviewedBy", "reviewedAt", "createdAt")
SELECT g."id",
       COALESCE((SELECT s->>'label' FROM jsonb_array_elements(c."skills") s WHERE s->>'id' = g."skill" LIMIT 1), g."skill"),
       NULL, g."title", g."scenes", g."status", g."model", 'prototype', g."reviewedBy", g."reviewedAt", g."createdAt"
FROM "GeneratedLesson" g
JOIN "CourseItem" i ON i."id" = g."itemId"
JOIN "CourseModule" m ON m."id" = i."moduleId"
JOIN "Course" c ON c."id" = m."courseId";

DROP TABLE "GeneratedPractice";
DROP TABLE "GeneratedLesson";
DROP TABLE "LearnerEvent";
