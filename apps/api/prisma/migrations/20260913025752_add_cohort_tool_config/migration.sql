-- CreateTable
CREATE TABLE "CohortToolConfig" (
    "cohortId" TEXT NOT NULL,
    "toolKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CohortToolConfig_pkey" PRIMARY KEY ("cohortId","toolKey")
);

-- AddForeignKey
ALTER TABLE "CohortToolConfig" ADD CONSTRAINT "CohortToolConfig_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;
