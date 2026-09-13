-- AlterTable
ALTER TABLE "Dataset" ADD COLUMN "institutionId" TEXT;

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN "institutionId" TEXT;

-- CreateIndex
CREATE INDEX "Dataset_institutionId_idx" ON "Dataset"("institutionId");

-- CreateIndex
CREATE INDEX "Assessment_institutionId_idx" ON "Assessment"("institutionId");

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
