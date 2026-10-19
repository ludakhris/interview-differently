-- Admin -> Compliance: each governing agency's requirements on us as a vendor and where we stand on them. Rows are
-- imported by platform admins from the page, a whole framework at a time, and never seeded from the repo (it is
-- public). Not a tenant table: rows hold no learner, participant, cohort or agency data, so there is no "agencyId",
-- trigger or row-level security policy (CLAUDE.md, Tenant isolation); only platform admins can reach the API.
-- The restricted app role gets its table grants from default privileges (scripts/create-app-role.ts). Additive.
SET lock_timeout = '5s';

CREATE TABLE "ComplianceRequirement" (
    "id" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "frameworkName" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "standing" TEXT NOT NULL,
    "plan" TEXT,
    "position" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplianceRequirement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ComplianceRequirement_status_check" CHECK ("status" IN ('satisfied', 'partial', 'not_satisfied', 'not_applicable'))
);
CREATE UNIQUE INDEX "ComplianceRequirement_framework_code_key" ON "ComplianceRequirement"("framework", "code");
CREATE INDEX "ComplianceRequirement_framework_position_idx" ON "ComplianceRequirement"("framework", "position");
