-- CreateTable
CREATE TABLE "SimulationResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "scenarioTitle" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "choiceSequence" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DimensionScore" (
    "id" TEXT NOT NULL,
    "simulationResultId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "quality" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,

    CONSTRAINT "DimensionScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SimulationResult_userId_idx" ON "SimulationResult"("userId");

-- CreateIndex
CREATE INDEX "SimulationResult_userId_scenarioId_idx" ON "SimulationResult"("userId", "scenarioId");

-- CreateIndex
CREATE INDEX "DimensionScore_simulationResultId_idx" ON "DimensionScore"("simulationResultId");

-- AddForeignKey
ALTER TABLE "DimensionScore" ADD CONSTRAINT "DimensionScore_simulationResultId_fkey" FOREIGN KEY ("simulationResultId") REFERENCES "SimulationResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
