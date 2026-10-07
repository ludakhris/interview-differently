-- When a platform was first switched on (null: still waiting for approval). Additive: one nullable column.

-- AlterTable
ALTER TABLE "LtiPlatform" ADD COLUMN     "approvedAt" TIMESTAMP(3);
