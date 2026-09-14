-- Assessment.defaultDraw: Int → Json so the frontmatter `draw` can be a
-- per-type map ({ mc: 3, sql: 1 }) as well as a plain total.
ALTER TABLE "Assessment" ALTER COLUMN "defaultDraw" TYPE JSONB USING to_jsonb("defaultDraw");
