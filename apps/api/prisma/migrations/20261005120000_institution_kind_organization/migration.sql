-- Institution.kind: rename 'member' to 'organization'.
ALTER TABLE "Institution" ALTER COLUMN "kind" SET DEFAULT 'organization';
UPDATE "Institution" SET "kind" = 'organization' WHERE "kind" = 'member';
