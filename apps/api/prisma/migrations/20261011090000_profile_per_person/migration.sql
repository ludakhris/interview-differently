-- #69: the talent profile is about the PERSON, not a provider. One TalentProfile per user; several
-- education entries; the learner chooses which organizations may see it (ProfileShare); a cohort can
-- require the profile and a periodic refresh. Hand-written: additive first, then transform, then drop.

-- 1. Cohort: require the profile in the learner's first course item, refresh every N months (null = never).
ALTER TABLE "Cohort" ADD COLUMN "requiresProfile" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Cohort" ADD COLUMN "profileRefreshMonths" INTEGER;

-- 2. New tables.
CREATE TABLE "ProfileEducation" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "fieldOfStudy" TEXT,
    "school" TEXT,
    "graduationYear" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProfileEducation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfileShare" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "allowEmployers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileShare_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProfileEducation_profileId_idx" ON "ProfileEducation"("profileId");
CREATE UNIQUE INDEX "ProfileShare_userId_institutionId_key" ON "ProfileShare"("userId", "institutionId");
CREATE INDEX "ProfileShare_institutionId_idx" ON "ProfileShare"("institutionId");

ALTER TABLE "ProfileEducation" ADD CONSTRAINT "ProfileEducation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileShare" ADD CONSTRAINT "ProfileShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileShare" ADD CONSTRAINT "ProfileShare_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Transform. Every old (provider, user) row becomes a share, so what staff could see before they
--    still can: allowEmployers = the old shareWithEmployers, updatedAt = the old consentUpdatedAt.
INSERT INTO "ProfileShare" ("id", "userId", "institutionId", "allowEmployers", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "userId", "providerId", "shareWithEmployers", "createdAt", COALESCE("consentUpdatedAt", "createdAt")
FROM "TalentProfile";

-- The profile that stays is the most recently updated one per user. Education entries from every old
-- row of the person are kept (the survivor's first, duplicates merged); a row with school or field but
-- no level gets level 'other'.
WITH ranked AS (
  SELECT t.*, ROW_NUMBER() OVER (PARTITION BY t."userId" ORDER BY t."updatedAt" DESC, t."id" DESC) AS rn
  FROM "TalentProfile" t
), keep AS (
  SELECT "userId", "id" AS keep_id FROM ranked WHERE rn = 1
), edu AS (
  SELECT k.keep_id,
         COALESCE(r."educationLevel", 'other') AS level,
         r."fieldOfStudy" AS field, r."school" AS school, r."graduationYear" AS year,
         MIN(r.rn) AS rn
  FROM ranked r JOIN keep k ON k."userId" = r."userId"
  WHERE r."educationLevel" IS NOT NULL OR r."fieldOfStudy" IS NOT NULL
     OR r."school" IS NOT NULL OR r."graduationYear" IS NOT NULL
  GROUP BY k.keep_id, COALESCE(r."educationLevel", 'other'), r."fieldOfStudy", r."school", r."graduationYear"
)
INSERT INTO "ProfileEducation" ("id", "profileId", "level", "fieldOfStudy", "school", "graduationYear", "position")
SELECT gen_random_uuid()::text, keep_id, level, field, school, year,
       (ROW_NUMBER() OVER (PARTITION BY keep_id ORDER BY rn, level, field, school, year) - 1)::int
FROM edu;

-- A resume on an older row moves to the survivor when the survivor has none.
UPDATE "TalentProfile" k
SET "resumeKey" = s."resumeKey", "resumeName" = s."resumeName", "resumeSize" = s."resumeSize", "resumeUploadedAt" = s."resumeUploadedAt"
FROM (
  SELECT DISTINCT ON ("userId") "userId", "resumeKey", "resumeName", "resumeSize", "resumeUploadedAt"
  FROM "TalentProfile" WHERE "resumeKey" IS NOT NULL
  ORDER BY "userId", "updatedAt" DESC, "id" DESC
) s
WHERE s."userId" = k."userId" AND k."resumeKey" IS NULL
  AND k."id" = (SELECT k2."id" FROM "TalentProfile" k2 WHERE k2."userId" = k."userId" ORDER BY k2."updatedAt" DESC, k2."id" DESC LIMIT 1);

DELETE FROM "TalentProfile" t
WHERE t."id" <> (SELECT k."id" FROM "TalentProfile" k WHERE k."userId" = t."userId" ORDER BY k."updatedAt" DESC, k."id" DESC LIMIT 1);

-- 4. Drop what moved.
ALTER TABLE "TalentProfile" DROP CONSTRAINT "TalentProfile_providerId_fkey";
DROP INDEX "TalentProfile_providerId_userId_key";
DROP INDEX "TalentProfile_userId_idx";
ALTER TABLE "TalentProfile"
  DROP COLUMN "providerId",
  DROP COLUMN "educationLevel",
  DROP COLUMN "fieldOfStudy",
  DROP COLUMN "school",
  DROP COLUMN "graduationYear",
  DROP COLUMN "shareWithEmployers",
  DROP COLUMN "consentUpdatedAt";
CREATE UNIQUE INDEX "TalentProfile_userId_key" ON "TalentProfile"("userId");

-- 5. `complete` is computed from the fields now. A profile that already meets the rule gets its
--    completedAt (kept as the date it first did) if it had none.
UPDATE "TalentProfile" p SET "completedAt" = p."updatedAt"
WHERE p."completedAt" IS NULL AND p."yearsExperience" IS NOT NULL
  AND (cardinality(p."industries") > 0 OR cardinality(p."targetRoles") > 0)
  AND EXISTS (SELECT 1 FROM "ProfileEducation" e WHERE e."profileId" = p."id");
