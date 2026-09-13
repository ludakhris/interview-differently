-- Deleting a cohort no longer deletes its assessment deliveries/attempts:
-- results stay with the student, the delivery just loses its cohort link.

-- DropForeignKey
ALTER TABLE "AssessmentDelivery" DROP CONSTRAINT "AssessmentDelivery_cohortId_fkey";

-- AlterTable
ALTER TABLE "AssessmentDelivery" ALTER COLUMN "cohortId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "AssessmentDelivery" ADD CONSTRAINT "AssessmentDelivery_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;
