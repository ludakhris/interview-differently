-- Undoes 20261018100000_checkpoint_tool: removes the checkpoint tool if no course item uses it. Delete the row from
-- "_prisma_migrations" afterwards.
BEGIN;
DELETE FROM "LtiTool" WHERE "toolId" = 'id-checkpoint'
  AND NOT EXISTS (SELECT 1 FROM "CourseItem" WHERE "config"->>'toolId' = 'id-checkpoint');
COMMIT;
