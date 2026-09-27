-- Assessment banks without Hands-On SQL questions need no dataset (#25).
-- Drops NOT NULL only; existing rows are untouched.
ALTER TABLE "Assessment" ALTER COLUMN "datasetId" DROP NOT NULL;
ALTER TABLE "AssessmentAttempt" ALTER COLUMN "datasetHash" DROP NOT NULL;
