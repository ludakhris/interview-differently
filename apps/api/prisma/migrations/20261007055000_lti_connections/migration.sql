-- Splits a tool's connection (client id, deployment id, URLs) from the tool itself, so tools that
-- share one registration with a vendor point at one row instead of repeating it. Existing tools
-- keep working: each distinct client id becomes one connection, named after its first tool.

-- CreateTable
CREATE TABLE "LtiConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "loginUrl" TEXT NOT NULL,
    "launchUrl" TEXT NOT NULL,
    "jwksUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LtiConnection_pkey" PRIMARY KEY ("id")
);

-- One connection per client id already in use (the earliest tool's settings and name win).
INSERT INTO "LtiConnection" ("id", "name", "clientId", "deploymentId", "loginUrl", "launchUrl", "jwksUrl", "updatedAt")
SELECT DISTINCT ON ("clientId")
    'conn-' || substr(md5("clientId"), 1, 12), "name", "clientId", "deploymentId", "loginUrl", "launchUrl", "jwksUrl", CURRENT_TIMESTAMP
FROM "LtiTool"
ORDER BY "clientId", "createdAt";

-- AlterTable: point each tool at its connection, then drop the columns the connection now holds.
ALTER TABLE "LtiTool" ADD COLUMN "connectionId" TEXT;
UPDATE "LtiTool" SET "connectionId" = 'conn-' || substr(md5("clientId"), 1, 12);
ALTER TABLE "LtiTool" ALTER COLUMN "connectionId" SET NOT NULL,
    DROP COLUMN "clientId",
    DROP COLUMN "deploymentId",
    DROP COLUMN "loginUrl",
    DROP COLUMN "launchUrl",
    DROP COLUMN "jwksUrl";

-- CreateIndex
CREATE UNIQUE INDEX "LtiConnection_clientId_key" ON "LtiConnection"("clientId");

-- CreateIndex
CREATE INDEX "LtiTool_connectionId_idx" ON "LtiTool"("connectionId");

-- AddForeignKey
ALTER TABLE "LtiTool" ADD CONSTRAINT "LtiTool_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "LtiConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
