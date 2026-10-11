-- GitHub issue #84. A person has at most one workspace-level membership (no cohort) at an institution. The
-- unique key on (user, institution, cohort) does not enforce that while the cohort is empty, because Postgres
-- treats empty values as different, so two simultaneous grants could leave two rows, and removing one would
-- leave the other's access behind.
--
-- Any duplicates that already exist are redundant: the one with a role is kept (else the oldest) and the others
-- are removed first, otherwise the index could not be built.
SET lock_timeout = '5s';

DELETE FROM "Membership" m USING "Membership" k
WHERE m."cohortId" IS NULL AND k."cohortId" IS NULL
  AND m."userId" = k."userId" AND m."institutionId" = k."institutionId" AND m."id" <> k."id"
  AND (
    (k."role" IS NOT NULL AND m."role" IS NULL)
    OR (
      (k."role" IS NULL) = (m."role" IS NULL)
      AND (k."createdAt" < m."createdAt" OR (k."createdAt" = m."createdAt" AND k."id" < m."id"))
    )
  );

CREATE UNIQUE INDEX "Membership_workspace_unique" ON "Membership" ("userId", "institutionId")
  WHERE "cohortId" IS NULL;

-- Deleting a cohort clears the cohort on its memberships. For a person who already has a workspace-level
-- membership at that institution that would make a second one, so those cohort memberships are removed first
-- (the person keeps the workspace one); everyone else's membership stays, without the cohort.
CREATE FUNCTION "cohort_clear_memberships"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM "Membership" m
  WHERE m."cohortId" = OLD."id"
    AND EXISTS (
      SELECT 1 FROM "Membership" w
      WHERE w."cohortId" IS NULL AND w."userId" = m."userId" AND w."institutionId" = m."institutionId"
    );
  RETURN OLD;
END $$;

CREATE TRIGGER "Cohort_clear_memberships" BEFORE DELETE ON "Cohort"
  FOR EACH ROW EXECUTE FUNCTION "cohort_clear_memberships"();
