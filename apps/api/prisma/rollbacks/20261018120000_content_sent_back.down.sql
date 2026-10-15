-- Undoes 20261018120000_content_sent_back. Sent-back uses would then read as live again, so they are deleted first
-- (as a send-back did before; their LessonEvents go with them). Delete the row from "_prisma_migrations" afterwards.
BEGIN;
DELETE FROM "PracticeSetUse" WHERE "sentBackAt" IS NOT NULL;
DELETE FROM "LessonUse" WHERE "sentBackAt" IS NOT NULL;
ALTER TABLE "PracticeSetUse" DROP COLUMN IF EXISTS "sentBackAt";
ALTER TABLE "LessonUse" DROP COLUMN IF EXISTS "sentBackAt";
COMMIT;
