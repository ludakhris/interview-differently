-- #124: request enrollment from an agency's public catalog. Additive: new nullable or defaulted columns on
-- tables that already have their agency trigger and tenant_isolation policy.
SET lock_timeout = '5s';

ALTER TABLE "Course" ADD COLUMN "tuitionDollars" INTEGER;
ALTER TABLE "Course" ADD COLUMN "contactHours" INTEGER;
ALTER TABLE "Course" ADD COLUMN "format" TEXT;
ALTER TABLE "Course" ADD COLUMN "prerequisite" TEXT;

ALTER TABLE "Cohort" ADD COLUMN "acceptsRequests" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "JoinRequest" ADD COLUMN "intake" JSONB;
