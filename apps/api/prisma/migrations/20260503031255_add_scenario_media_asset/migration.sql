-- CreateTable
CREATE TABLE "ScenarioMediaAsset" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "scriptHash" TEXT NOT NULL,
    "presenterId" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScenarioMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScenarioMediaAsset_scenarioId_idx" ON "ScenarioMediaAsset"("scenarioId");

-- CreateIndex
CREATE INDEX "ScenarioMediaAsset_status_idx" ON "ScenarioMediaAsset"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioMediaAsset_scenarioId_nodeId_key" ON "ScenarioMediaAsset"("scenarioId", "nodeId");
