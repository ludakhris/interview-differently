import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The data transform of migration 20261011090000_profile_per_person, run for real on Postgres
// (PGlite) over the old per-provider shape. PGlite needs Node's VM modules, so this only runs with:
//   NODE_OPTIONS=--experimental-vm-modules npx jest profile-migration
const enabled = /experimental-vm-modules/.test(process.env.NODE_OPTIONS ?? '')
const SQL = readFileSync(
  join(__dirname, '../../../prisma/migrations/20261011090000_profile_per_person/migration.sql'),
  'utf8'
)
let db: PGlite

const OLD = `
CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
CREATE TABLE "Institution" ("id" TEXT PRIMARY KEY);
CREATE TABLE "Cohort" ("id" TEXT PRIMARY KEY);
CREATE TABLE "TalentProfile" (
  "id" TEXT NOT NULL, "providerId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "resumeKey" TEXT, "resumeName" TEXT, "resumeSize" INTEGER, "resumeUploadedAt" TIMESTAMP(3),
  "educationLevel" TEXT, "fieldOfStudy" TEXT, "school" TEXT, "graduationYear" INTEGER,
  "yearsExperience" INTEGER, "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "previousCompensation" INTEGER, "targetCompensation" INTEGER,
  "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[], "availableFrom" TIMESTAMP(3),
  "shareWithEmployers" BOOLEAN NOT NULL DEFAULT false, "consentUpdatedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TalentProfile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TalentProfile_userId_idx" ON "TalentProfile"("userId");
CREATE UNIQUE INDEX "TalentProfile_providerId_userId_key" ON "TalentProfile"("providerId", "userId");
ALTER TABLE "TalentProfile" ADD CONSTRAINT "TalentProfile_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentProfile" ADD CONSTRAINT "TalentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "User" VALUES ('u1'),('u2'),('u3');
INSERT INTO "Institution" VALUES ('P1'),('P2');
-- u1: two providers. The P2 row is newer, so it is the profile that stays.
INSERT INTO "TalentProfile" ("id","providerId","userId","educationLevel","school","graduationYear","yearsExperience","industries","shareWithEmployers","resumeKey","resumeName","completedAt","createdAt","updatedAt","consentUpdatedAt")
 VALUES ('a','P1','u1','associate','Harbor CC',2015,2,ARRAY['retail'],true,'talent/resumes/P1/u1/x-cv.pdf','cv.pdf','2026-01-02','2026-01-01','2026-01-05','2026-01-03');
INSERT INTO "TalentProfile" ("id","providerId","userId","educationLevel","school","fieldOfStudy","graduationYear","yearsExperience","industries","targetRoles","shareWithEmployers","completedAt","createdAt","updatedAt")
 VALUES ('b','P2','u1','bachelor','State U','Biology',2019,5,ARRAY['health'],ARRAY['analyst'],false,'2026-02-02','2026-02-01','2026-02-05');
-- u2: one provider, complete, shared, no education at all.
INSERT INTO "TalentProfile" ("id","providerId","userId","yearsExperience","targetRoles","shareWithEmployers","createdAt","updatedAt")
 VALUES ('c','P1','u2',0,ARRAY['clerk'],true,'2026-03-01','2026-03-02');
-- u3: school but no level, otherwise empty.
INSERT INTO "TalentProfile" ("id","providerId","userId","school","createdAt","updatedAt")
 VALUES ('d','P1','u3','Night School','2026-03-01','2026-03-02');
`

const suite = enabled ? describe : describe.skip

suite('migration profile_per_person', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(OLD)
    await db.exec(SQL)
  })

  it('leaves one profile per user: the most recently updated', async () => {
    const r = await db.query<{ id: string; userId: string }>(
      'SELECT "id","userId" FROM "TalentProfile" ORDER BY "userId"'
    )
    expect(r.rows).toEqual([
      { id: 'b', userId: 'u1' },
      { id: 'c', userId: 'u2' },
      { id: 'd', userId: 'u3' },
    ])
    await expect(
      db.exec(`INSERT INTO "TalentProfile" ("id","userId","updatedAt") VALUES ('z','u1',now())`)
    ).rejects.toThrow()
  })

  it('creates a share for every old (provider, user) row, keeping the employers consent', async () => {
    const r = await db.query<{ userId: string; institutionId: string; allowEmployers: boolean }>(
      'SELECT "userId","institutionId","allowEmployers" FROM "ProfileShare" ORDER BY 1,2'
    )
    expect(r.rows).toEqual([
      { userId: 'u1', institutionId: 'P1', allowEmployers: true },
      { userId: 'u1', institutionId: 'P2', allowEmployers: false },
      { userId: 'u2', institutionId: 'P1', allowEmployers: true },
      { userId: 'u3', institutionId: 'P1', allowEmployers: false },
    ])
    const consent = await db.query<{ at: string }>(
      `SELECT "updatedAt"::text AS at FROM "ProfileShare" WHERE "userId"='u1' AND "institutionId"='P1'`
    )
    expect(consent.rows[0].at).toBe('2026-01-03 00:00:00')
  })

  it('moves the old education columns into entries, merging a person across rows', async () => {
    const r = await db.query<{
      profileId: string
      level: string
      school: string
      position: number
    }>(
      'SELECT "profileId","level","school","position" FROM "ProfileEducation" ORDER BY "profileId","position"'
    )
    expect(r.rows).toEqual([
      { profileId: 'b', level: 'bachelor', school: 'State U', position: 0 },
      { profileId: 'b', level: 'associate', school: 'Harbor CC', position: 1 },
      { profileId: 'd', level: 'other', school: 'Night School', position: 0 },
    ])
  })

  it('keeps the resume of an older row when the survivor has none, and drops the old columns', async () => {
    const r = await db.query<{ resumeKey: string | null }>(
      `SELECT "resumeKey" FROM "TalentProfile" WHERE "id"='b'`
    )
    expect(r.rows[0].resumeKey).toBe('talent/resumes/P1/u1/x-cv.pdf')
    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name='TalentProfile'`
    )
    const names = cols.rows.map((c) => c.column_name)
    for (const gone of [
      'providerId',
      'educationLevel',
      'fieldOfStudy',
      'school',
      'graduationYear',
      'shareWithEmployers',
      'consentUpdatedAt',
    ])
      expect(names).not.toContain(gone)
  })

  it('gives completedAt to a profile that already meets the rule, and only that one', async () => {
    const r = await db.query<{ id: string; completedAt: string | null }>(
      'SELECT "id","completedAt"::text AS "completedAt" FROM "TalentProfile" ORDER BY "id"'
    )
    expect(r.rows.map((x) => [x.id, x.completedAt !== null])).toEqual([
      ['b', true],
      ['c', false], // no education entry, so not complete
      ['d', false],
    ])
    expect(r.rows[0].completedAt).toBe('2026-02-02 00:00:00')
  })

  it('adds the cohort fields with the old behaviour as the default', async () => {
    await db.exec(`INSERT INTO "Cohort" ("id") VALUES ('k1')`)
    const r = await db.query<{ requiresProfile: boolean; profileRefreshMonths: number | null }>(
      'SELECT "requiresProfile","profileRefreshMonths" FROM "Cohort"'
    )
    expect(r.rows[0]).toEqual({ requiresProfile: false, profileRefreshMonths: null })
  })
})
