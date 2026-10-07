-- Platforms that launch Interview Differently as an LTI tool, and the history of changes to them.
-- Additive: two new tables.

-- CreateTable
CREATE TABLE "LtiPlatform" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "authUrl" TEXT NOT NULL,
    "tokenUrl" TEXT NOT NULL,
    "jwksUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LtiPlatform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LtiPlatformChange" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LtiPlatformChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LtiPlatform_issuer_clientId_key" ON "LtiPlatform"("issuer", "clientId");

-- CreateIndex
CREATE INDEX "LtiPlatformChange_subjectId_createdAt_idx" ON "LtiPlatformChange"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "LtiPlatformChange_createdAt_idx" ON "LtiPlatformChange"("createdAt");
