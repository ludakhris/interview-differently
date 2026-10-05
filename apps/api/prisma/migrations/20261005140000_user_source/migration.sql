-- User.source: which Clerk instance issued the id ('interview' | 'learn').
-- Email is now unique per source, not globally: one person can hold an account in each app.
ALTER TABLE "User" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'interview';
DROP INDEX "User_email_key";
CREATE UNIQUE INDEX "User_email_source_key" ON "User"("email", "source");
