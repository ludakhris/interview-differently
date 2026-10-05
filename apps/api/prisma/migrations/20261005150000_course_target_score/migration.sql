-- Course.targetScore: post-assessment score a learner must reach to meet the course target.
ALTER TABLE "Course" ADD COLUMN "targetScore" INTEGER NOT NULL DEFAULT 80;
