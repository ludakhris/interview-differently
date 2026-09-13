-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN "institutionId" TEXT;

-- CreateIndex
CREATE INDEX "Scenario_institutionId_idx" ON "Scenario"("institutionId");

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
