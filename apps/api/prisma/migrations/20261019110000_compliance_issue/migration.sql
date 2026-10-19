-- Admin -> Compliance: the GitHub issue that tracks the work on a partly or not satisfied requirement. Additive.
SET lock_timeout = '5s';

ALTER TABLE "ComplianceRequirement" ADD COLUMN "issue" INTEGER;
