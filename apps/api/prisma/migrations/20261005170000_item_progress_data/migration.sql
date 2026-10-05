-- ItemProgress.data: SCORM runtime data (cmi) so a package can resume.
ALTER TABLE "ItemProgress" ADD COLUMN "data" JSONB;
