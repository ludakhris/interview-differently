-- Undoes 20261017090000_adaptive_checkpoints: skips and generated practice are lost. Delete the row from "_prisma_migrations" afterwards.
BEGIN;
DROP TABLE IF EXISTS "GeneratedPractice";
DROP TABLE IF EXISTS "PlanSkip";
ALTER TABLE "Course" DROP COLUMN IF EXISTS "adaptive";
COMMIT;
