-- Undoes 20261018110000_standalone_cohort only while nothing is recorded in the cohort (its work-simulation history
-- goes with it otherwise, so check first). The standalone agency stays: other standalone institutions use it.
-- Delete the row from "_prisma_migrations" afterwards.
BEGIN;
DELETE FROM "Cohort" WHERE "id" = 'interview-differently-standalone'
  AND NOT EXISTS (SELECT 1 FROM "PracticeEvent" WHERE "cohortId" = 'interview-differently-standalone');
DELETE FROM "Institution" WHERE "id" = 'interview-differently'
  AND NOT EXISTS (SELECT 1 FROM "Cohort" WHERE "institutionId" = 'interview-differently');
COMMIT;
