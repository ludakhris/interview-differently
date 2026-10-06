-- Shared single-use and rate-limit state for the LTI platform and tool, so more than one API
-- instance (or a restart) cannot replay a launch hint, assertion, login state or submission.
-- Additive: one new table, no existing column or row changes.

-- CreateTable
CREATE TABLE "LtiSingleUse" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LtiSingleUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LtiSingleUse_expiresAt_idx" ON "LtiSingleUse"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "LtiSingleUse_scope_key_key" ON "LtiSingleUse"("scope", "key");
