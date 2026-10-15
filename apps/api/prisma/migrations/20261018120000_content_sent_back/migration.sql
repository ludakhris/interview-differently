-- Course staff sending back AI content (GitHub issue #90) marks their cohort's uses of it instead of deleting them, so
-- the learners' history (a lesson's LessonEvents, which practice they were given) survives. A slot whose newest use
-- was sent back is given new content; sent-back content is never reused in that cohort.
ALTER TABLE "PracticeSetUse" ADD COLUMN "sentBackAt" TIMESTAMP(3);
ALTER TABLE "LessonUse" ADD COLUMN "sentBackAt" TIMESTAMP(3);
