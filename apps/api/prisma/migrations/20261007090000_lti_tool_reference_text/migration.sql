-- What the course editor calls an item's "Reference" for each tool, and how to find the value, so a
-- tool's own wording replaces text that was hard-coded for the two Interview Differently tools.
-- Additive: two nullable columns. The two existing tools get the wording the editor already showed.

-- AlterTable
ALTER TABLE "LtiTool" ADD COLUMN     "referenceHelp" TEXT,
ADD COLUMN     "referenceLabel" TEXT;

UPDATE "LtiTool"
SET "referenceLabel" = 'Assessment slug',
    "referenceHelp" = 'The assessment''s slug, as set when it was imported in Interview Differently (Admin, Assessments). A wrong slug only shows up when a learner opens it.'
WHERE "toolId" = 'id-assessment' AND "referenceLabel" IS NULL;

UPDATE "LtiTool"
SET "referenceLabel" = 'Interview scenario id',
    "referenceHelp" = 'Which interview this opens. In Interview Differently, open the interview in the builder: its id is the last part of the page address (.../builder/your-interview-id). Check it before saving, since a wrong id only shows up when a learner opens it. The learner goes to the tool in the same window and comes back here with the score.'
WHERE "toolId" = 'id-interview' AND "referenceLabel" IS NULL;
