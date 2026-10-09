-- Per-delivery switch: learners review their answers after submitting. NULL = default by label (post yes, pre no).
ALTER TABLE "AssessmentDelivery" ADD COLUMN "showReview" BOOLEAN;
