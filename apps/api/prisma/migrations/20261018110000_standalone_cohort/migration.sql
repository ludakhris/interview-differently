-- The system cohort "Interview Differently Standalone" (docs/product-boundaries.md, "Every attempt belongs to a
-- cohort"): where standalone Interview Differently records work for a person with no program, such as a work
-- simulation opened from the ID dashboard (GitHub issue #90). It sits under the institution "Interview Differently",
-- under the Interview Differently Standalone agency (apps/api/src/core/standalone-agency.ts). Fixed ids, so every
-- environment names the same rows; anything already there is left alone. The cohort's agency is set by its trigger.
INSERT INTO "Institution" ("id", "name", "kind", "createdAt", "updatedAt")
VALUES ('interview-differently-standalone', 'Interview Differently Standalone', 'agency', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Institution" ("id", "name", "kind", "parentId", "createdAt", "updatedAt")
VALUES ('interview-differently', 'Interview Differently', 'organization', 'interview-differently-standalone', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Cohort" ("id", "institutionId", "name", "createdAt", "updatedAt")
VALUES ('interview-differently-standalone', 'interview-differently', 'Interview Differently Standalone', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
