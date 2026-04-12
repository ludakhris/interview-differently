-- CreateTable
CREATE TABLE "ImmersiveSession" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImmersiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImmersiveResponse" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "transcript" TEXT,
    "durationSeconds" INTEGER,
    "aiFeedback" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImmersiveResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImmersiveSession_userId_idx" ON "ImmersiveSession"("userId");

-- CreateIndex
CREATE INDEX "ImmersiveSession_scenarioId_idx" ON "ImmersiveSession"("scenarioId");

-- CreateIndex
CREATE INDEX "ImmersiveResponse_sessionId_idx" ON "ImmersiveResponse"("sessionId");

-- AddForeignKey
ALTER TABLE "ImmersiveResponse" ADD CONSTRAINT "ImmersiveResponse_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ImmersiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
