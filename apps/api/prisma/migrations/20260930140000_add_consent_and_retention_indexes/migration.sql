-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_idx" ON "ConsentRecord"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRecord_userId_kind_version_key" ON "ConsentRecord"("userId", "kind", "version");

-- CreateIndex
CREATE INDEX "SqlQueryLog_userId_createdAt_idx" ON "SqlQueryLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ImmersiveResponse_createdAt_idx" ON "ImmersiveResponse"("createdAt");
