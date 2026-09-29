-- Last autosave/submit time per attempt, for live progress (#40).
-- Backfilled from the latest known timestamp rather than migration time.
ALTER TABLE "AssessmentAttempt" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "AssessmentAttempt" SET "updatedAt" = COALESCE("submittedAt", "startedAt");
