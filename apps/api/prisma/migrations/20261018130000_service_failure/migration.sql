-- Failures a learner hit through no fault of their own, kept so the public health checks and the admin System status
-- page survive a deploy (GitHub issue #92). One table for every product, told apart by "service": 'grading' (the Skill
-- Simulator's SQL grading would not run, or every grading slot stayed busy) and 'lessons' (Spark could not write a
-- lesson made for a learner). Each product writes only its own rows, from its own folder. The API deletes rows older
-- than 30 days as it writes.
-- Not a tenant table: a row holds only a time, a service, a kind and a reason, no learner, participant, cohort or
-- agency, so it has no "agencyId", trigger or row-level security policy (CLAUDE.md, Tenant isolation). The restricted
-- app role gets its table grants from the default privileges set by scripts/create-app-role.ts. Additive.
SET lock_timeout = '5s';

CREATE TABLE "ServiceFailure" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "service" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    CONSTRAINT "ServiceFailure_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ServiceFailure_service_check" CHECK ("service" IN ('grading', 'lessons'))
);
CREATE INDEX "ServiceFailure_service_at_idx" ON "ServiceFailure"("service", "at");
