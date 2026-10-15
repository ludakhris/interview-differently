-- The Interview Differently checkpoint tool (GitHub issue #90), so every environment has it without a separate seed
-- step. The tool row holds nothing specific to an environment (the connection holds the URLs), so it is added here,
-- under the built-in Interview Differently connection, when that connection exists. A row that is already there
-- (added by `npm run seed:lti-tools`, or edited by an admin) is left alone.
WITH added AS (
  INSERT INTO "LtiTool" ("toolId", "connectionId", "name", "kind", "retries", "labelable", "enabled", "referenceLabel", "referenceHelp", "workspaceIds", "createdAt", "updatedAt")
  SELECT 'id-checkpoint', 'interview-differently', 'Interview Differently checkpoint', 'checkpoint', true, false, true,
         'Question bank slug',
         'The question bank''s slug, as set when it was imported in Interview Differently (Admin, Assessments). The checkpoint''s requests are question numbers in that bank.',
         ARRAY[]::TEXT[], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  WHERE EXISTS (SELECT 1 FROM "LtiConnection" WHERE "id" = 'interview-differently')
  ON CONFLICT ("toolId") DO NOTHING
  RETURNING "toolId", "name"
)
INSERT INTO "LtiRegistryChange" ("id", "subject", "subjectId", "subjectName", "action", "userId", "userName", "changes", "createdAt")
SELECT gen_random_uuid()::TEXT, 'tool', "toolId", "name", 'created', NULL, 'System (migration)',
       '{"kind": {"from": null, "to": "checkpoint"}}'::JSONB, CURRENT_TIMESTAMP
FROM added;
