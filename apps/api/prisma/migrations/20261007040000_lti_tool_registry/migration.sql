-- Registry of connected LTI tools, so an admin can add a tool or change a built-in's settings
-- without a deploy. Additive: one new table, no existing column or row changes.

-- CreateTable
CREATE TABLE "LtiTool" (
    "toolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "retries" BOOLEAN NOT NULL,
    "labelable" BOOLEAN NOT NULL,
    "clientId" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "loginUrl" TEXT NOT NULL,
    "launchUrl" TEXT NOT NULL,
    "jwksUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "workspaceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LtiTool_pkey" PRIMARY KEY ("toolId")
);
