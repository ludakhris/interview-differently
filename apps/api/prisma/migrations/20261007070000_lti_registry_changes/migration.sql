-- History of changes to connected tools and their connections: who changed what. Additive: one new table.

-- CreateTable
CREATE TABLE "LtiRegistryChange" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LtiRegistryChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LtiRegistryChange_subjectId_createdAt_idx" ON "LtiRegistryChange"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "LtiRegistryChange_createdAt_idx" ON "LtiRegistryChange"("createdAt");
