-- How long an assessment is designed to take, from frontmatter `expected_minutes` (#39).
-- Nullable; existing rows are untouched.
ALTER TABLE "Assessment" ADD COLUMN "expectedMinutes" INTEGER;
