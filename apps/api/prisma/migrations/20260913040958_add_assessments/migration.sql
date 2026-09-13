-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "sourceMarkdown" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "defaultDraw" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentDelivery" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "timeLimitMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "datasetHash" TEXT NOT NULL,
    "drawnQuestionIds" JSONB NOT NULL,
    "answers" JSONB NOT NULL,
    "sectionScores" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "submittedLate" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_slug_key" ON "Assessment"("slug");

-- CreateIndex
CREATE INDEX "Assessment_datasetId_idx" ON "Assessment"("datasetId");

-- CreateIndex
CREATE INDEX "AssessmentDelivery_assessmentId_idx" ON "AssessmentDelivery"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentDelivery_cohortId_idx" ON "AssessmentDelivery"("cohortId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_userId_idx" ON "AssessmentAttempt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttempt_deliveryId_userId_key" ON "AssessmentAttempt"("deliveryId", "userId");

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentDelivery" ADD CONSTRAINT "AssessmentDelivery_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentDelivery" ADD CONSTRAINT "AssessmentDelivery_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "AssessmentDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
