-- Undoes 20261018130000_service_failure: the record of learner grading and lesson-writing failures is lost (the health
-- endpoints and the System status page then fail until the API is rolled back too). Delete the row from
-- "_prisma_migrations" afterwards.
BEGIN;
DROP TABLE IF EXISTS "ServiceFailure";
COMMIT;
