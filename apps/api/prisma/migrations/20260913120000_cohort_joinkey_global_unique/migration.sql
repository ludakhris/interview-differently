-- Cohort join keys become globally unique (#16): a key identifies one cohort.

-- DropIndex
DROP INDEX "Cohort_institutionId_joinKey_key";

-- DropIndex
DROP INDEX "Cohort_joinKey_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Cohort_joinKey_key" ON "Cohort"("joinKey");
