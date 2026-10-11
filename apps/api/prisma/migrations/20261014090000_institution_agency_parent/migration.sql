-- Every institution belongs to an agency (GitHub issue #84): an agency has no parent, every other
-- institution has one, and that parent is an agency.
--
-- NOT VALID: the rule applies to every insert and update from now on but does not scan existing rows, so the
-- deploy cannot fail on data that predates it. It still refuses an UPDATE that leaves a legacy institution
-- without an agency, so institutions that predate the rule are moved under the standalone agency by
-- scripts/assign-standalone-agency.ts BEFORE this migration is deployed; a later migration then validates the
-- constraint.
SET lock_timeout = '10s';

ALTER TABLE "Institution"
  ADD CONSTRAINT "Institution_agency_parent_check"
  CHECK (
    ("kind" = 'agency' AND "parentId" IS NULL)
    OR ("kind" <> 'agency' AND "parentId" IS NOT NULL)
  ) NOT VALID;

-- The parent of a non-agency must itself be an agency (a CHECK cannot read another row).
CREATE FUNCTION "institution_parent_is_agency"() RETURNS trigger AS $$
BEGIN
  IF NEW."parentId" IS NOT NULL AND (NEW."parentId" = NEW."id" OR NOT EXISTS (
    SELECT 1 FROM "Institution" WHERE "id" = NEW."parentId" AND "kind" = 'agency'
  )) THEN
    RAISE EXCEPTION 'Institution parent must be an agency' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Institution_parent_is_agency"
  BEFORE INSERT OR UPDATE OF "parentId", "kind" ON "Institution"
  FOR EACH ROW EXECUTE FUNCTION "institution_parent_is_agency"();
