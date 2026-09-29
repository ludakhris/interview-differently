-- CreateTable
CREATE TABLE "SqlQueryLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cohortId" TEXT,
    "datasetSlug" TEXT NOT NULL,
    "queryText" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "rowCount" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SqlQueryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SqlQueryLog_cohortId_createdAt_idx" ON "SqlQueryLog"("cohortId", "createdAt");

-- CreateIndex
CREATE INDEX "SqlQueryLog_createdAt_idx" ON "SqlQueryLog"("createdAt");
