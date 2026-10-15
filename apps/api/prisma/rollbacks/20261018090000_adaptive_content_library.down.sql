-- Undoes 20261018090000_adaptive_content_library: the content library, its uses and the checkpoint and lesson history
-- are lost, and the prototype tables it replaced are not recreated. Delete the row from "_prisma_migrations" afterwards.
BEGIN;
DROP TABLE IF EXISTS "LessonEvent";
DROP TABLE IF EXISTS "LessonUse";
DROP TABLE IF EXISTS "PracticeEvent";
DROP TABLE IF EXISTS "PracticeSetUse";
DROP TABLE IF EXISTS "Lesson";
DROP TABLE IF EXISTS "PracticeSet";
ALTER TABLE "AssessmentDelivery" DROP COLUMN IF EXISTS "config";
COMMIT;
