-- AlterTable
ALTER TABLE "AssessmentDelivery" ADD COLUMN     "inviteCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentDelivery_inviteCode_key" ON "AssessmentDelivery"("inviteCode");

