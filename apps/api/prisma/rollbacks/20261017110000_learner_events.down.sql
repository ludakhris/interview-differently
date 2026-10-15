-- Undoes 20261017110000_learner_events: the attempt, help and view history is lost. Delete the row from "_prisma_migrations" afterwards.
BEGIN;
DROP TABLE IF EXISTS "LearnerEvent";
COMMIT;
