-- Course.readinessThreshold: best interview score at or above which a learner counts as "interview ready".
ALTER TABLE "Course" ADD COLUMN "readinessThreshold" INTEGER NOT NULL DEFAULT 70;
