-- The graph-canvas builder is gone (#28); strip its geometry from stored scenarios.
-- Idempotent: only touches rows that still carry builderMeta.positions.
UPDATE "Scenario"
SET "data" = "data" #- '{builderMeta,positions}'
WHERE "data" #> '{builderMeta,positions}' IS NOT NULL;
