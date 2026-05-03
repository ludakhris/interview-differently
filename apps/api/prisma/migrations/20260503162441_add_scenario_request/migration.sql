-- CreateTable
CREATE TABLE "ScenarioRequest" (
    "id" TEXT NOT NULL,
    "situation" TEXT NOT NULL,
    "role" TEXT,
    "reportsTo" TEXT,
    "timeInRole" TEXT,
    "otherPeople" TEXT,
    "metricsContext" TEXT,
    "timePressure" TEXT,
    "hardestMoment" TEXT NOT NULL,
    "temptingWrong" TEXT,
    "greatLooksLike" TEXT,
    "track" TEXT,
    "estimatedMinutes" INTEGER,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailError" TEXT,
    "notes" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScenarioRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScenarioRequest_status_idx" ON "ScenarioRequest"("status");

-- CreateIndex
CREATE INDEX "ScenarioRequest_createdAt_idx" ON "ScenarioRequest"("createdAt");
