import type { PGlite } from '@electric-sql/pglite'
import { TENANT_TABLES } from './tenant-tables'
import { dbTestsEnabled, insert, migratedDb, migrationSql } from './testing/tenant-db'

// The database rules behind tenant isolation (GitHub issue #84), run on real Postgres.
const suite = dbTestsEnabled ? describe : describe.skip

suite('agency structure and agencyId triggers', () => {
  let db: PGlite
  const one = async (sql: string, args: unknown[] = []) =>
    (await db.query<{ agencyId: string | null }>(sql, args)).rows[0]

  afterAll(() => db.close())

  beforeAll(async () => {
    db = await migratedDb()
    for (const id of ['A', 'B']) {
      await insert(db, 'Institution', { id, name: `Agency ${id}`, kind: 'agency' })
      await insert(db, 'Institution', {
        id: `prov-${id}`,
        name: 'P',
        kind: 'provider',
        parentId: id,
      })
      await insert(db, 'Institution', {
        id: `org-${id}`,
        name: 'O',
        kind: 'organization',
        parentId: id,
      })
      await insert(db, 'Course', { id: `course-${id}`, providerId: `prov-${id}`, slug: `c-${id}` })
      await insert(db, 'User', { id: `learner-${id}` })
    }
  })

  describe('courses', () => {
    it('take the agency of their provider, and their modules and items copy it', async () => {
      await insert(db, 'CourseModule', { id: 'mod-agency', courseId: 'course-A' })
      await insert(db, 'CourseItem', { id: 'item-agency', moduleId: 'mod-agency' })
      expect((await one(`SELECT "agencyId" FROM "Course" WHERE id='course-A'`)).agencyId).toBe('A')
      expect(
        (await one(`SELECT "agencyId" FROM "CourseModule" WHERE id='mod-agency'`)).agencyId
      ).toBe('A')
      expect(
        (await one(`SELECT "agencyId" FROM "CourseItem" WHERE id='item-agency'`)).agencyId
      ).toBe('A')
    })
  })

  describe('a row must have an agency', () => {
    it('every tenant table refuses a row without one, even when its trigger does not run', async () => {
      const tables = await db.query<{ conrelid: string }>(
        `SELECT conrelid::regclass::text AS conrelid FROM pg_constraint WHERE conname LIKE '%\\_agency\\_required' ESCAPE '\\'`
      )
      expect(tables.rows.map((r) => r.conrelid.replace(/"/g, '')).sort()).toEqual(
        [...TENANT_TABLES].sort()
      )
      await insert(db, 'Cohort', { id: 'coh-noagency', institutionId: 'org-A', name: 'x' })
      await db.query(`ALTER TABLE "Enrollment" DISABLE TRIGGER USER`)
      try {
        await expect(
          db.query(
            `INSERT INTO "Enrollment" ("id","cohortId","userId","agencyId") VALUES ('en-noagency','coh-noagency','learner-A',NULL)`
          )
        ).rejects.toThrow(/Enrollment_agency_required/)
      } finally {
        await db.query(`ALTER TABLE "Enrollment" ENABLE TRIGGER USER`)
      }
    })

    it('the migration refuses to run on a database that has not been backfilled, and says what to do', async () => {
      const old = await migratedDb({ before: '20261016090000_require_agency' })
      try {
        await old.query(
          `INSERT INTO "Institution" ("id","name","kind","updatedAt") VALUES ('a1','A','agency', now())`
        )
        await old.query(
          `INSERT INTO "Institution" ("id","name","kind","parentId","updatedAt") VALUES ('p1','P','provider','a1', now())`
        )
        // a cohort from before the agency columns existed: no agency, and no trigger to fill it
        await old.query(`ALTER TABLE "Cohort" DISABLE TRIGGER USER`)
        await old.query(
          `INSERT INTO "Cohort" ("id","institutionId","name","joinKey","updatedAt") VALUES ('c1','p1','legacy','legacy-key', now())`
        )
        await expect(old.exec(migrationSql('20261016090000_require_agency'))).rejects.toThrow(
          /1 rows in "Cohort" have no agency: run scripts\/assign-standalone-agency\.ts and scripts\/backfill-agency-id\.ts first/
        )
      } finally {
        await old.close()
      }
    })
  })

  describe('institution structure', () => {
    it('refuses an institution with no agency, and an agency with a parent', async () => {
      await expect(
        insert(db, 'Institution', { id: 'o1', name: 'x', kind: 'organization' })
      ).rejects.toThrow()
      await expect(
        insert(db, 'Institution', { id: 'g1', name: 'x', kind: 'agency', parentId: 'A' })
      ).rejects.toThrow()
    })
    it('refuses an institution that is its own parent', async () => {
      await expect(
        db.query(`UPDATE "Institution" SET "kind" = 'provider', "parentId" = "id" WHERE id = 'B'`)
      ).rejects.toThrow(/must be an agency/)
    })
    it('refuses a parent that is not an agency', async () => {
      await expect(
        insert(db, 'Institution', { id: 'o2', name: 'x', kind: 'organization', parentId: 'prov-A' })
      ).rejects.toThrow(/must be an agency/)
    })
  })

  describe('cohort and what hangs off it', () => {
    let cohortA: string
    beforeAll(async () => {
      cohortA = (await insert(db, 'Cohort', { id: 'coh-A', institutionId: 'org-A', name: 'c' }))
        .id as string
      await insert(db, 'Cohort', { id: 'coh-B', institutionId: 'prov-B', name: 'c' })
    })

    it('takes the agency of the institution that runs it', async () => {
      expect((await one(`SELECT "agencyId" FROM "Cohort" WHERE id='coh-A'`)).agencyId).toBe('A')
      expect((await one(`SELECT "agencyId" FROM "Cohort" WHERE id='coh-B'`)).agencyId).toBe('B')
    })
    it('lets the creator name the agency, then never lets it change', async () => {
      await insert(db, 'Cohort', {
        id: 'coh-pick',
        institutionId: 'prov-A',
        name: 'c',
        agencyId: 'B',
      })
      expect((await one(`SELECT "agencyId" FROM "Cohort" WHERE id='coh-pick'`)).agencyId).toBe('B')
      await expect(
        db.query(`UPDATE "Cohort" SET "agencyId" = 'A' WHERE id='coh-pick'`)
      ).rejects.toThrow(/another agency/)
    })
    it('is copied onto enrollments, join requests and sessions, whatever the caller passes', async () => {
      await insert(db, 'Enrollment', {
        id: 'en-A',
        cohortId: cohortA,
        userId: 'learner-A',
        agencyId: 'B',
      })
      await insert(db, 'JoinRequest', { id: 'jr-A', cohortId: cohortA, userId: 'learner-B' })
      await insert(db, 'CohortSession', { id: 'se-A', cohortId: cohortA })
      for (const t of ['Enrollment', 'JoinRequest', 'CohortSession']) {
        expect((await one(`SELECT "agencyId" FROM "${t}" LIMIT 1`)).agencyId).toBe('A')
      }
    })
    it('is copied down to progress, attempts, plan, activity and attendance', async () => {
      await insert(db, 'CourseModule', { id: 'mod-A', courseId: 'course-A' })
      await insert(db, 'CourseItem', { id: 'item-A', moduleId: 'mod-A' })
      const item = { enrollmentId: 'en-A', itemId: 'item-A' }
      await insert(db, 'ItemProgress', item)
      await insert(db, 'ItemAttempt', item)
      await insert(db, 'PlanItem', item)
      await insert(db, 'PlanSkip', item)
      const learner = { cohortId: cohortA, userId: 'learner-A', itemId: 'item-A' }
      await insert(db, 'PracticeSet', { id: 'set-A' })
      await insert(db, 'Lesson', { id: 'lesson-A' })
      await insert(db, 'PracticeSetUse', { ...learner, practiceSetId: 'set-A' })
      await insert(db, 'PracticeEvent', learner)
      await insert(db, 'LessonUse', { ...learner, id: 'use-A', lessonId: 'lesson-A' })
      await insert(db, 'LessonEvent', {
        cohortId: cohortA,
        userId: 'learner-A',
        lessonUseId: 'use-A',
      })
      await insert(db, 'ActivitySession', { ...item, userId: 'learner-A' })
      await insert(db, 'AttendanceMark', { sessionId: 'se-A', userId: 'learner-A' })
      for (const t of [
        'ItemProgress',
        'ItemAttempt',
        'PlanItem',
        'PlanSkip',
        'PracticeSetUse',
        'PracticeEvent',
        'LessonUse',
        'LessonEvent',
        'ActivitySession',
        'AttendanceMark',
      ]) {
        expect((await one(`SELECT "agencyId" FROM "${t}" LIMIT 1`)).agencyId).toBe('A')
      }
    })
    it('refuses a row whose parent has no agency or does not exist', async () => {
      await expect(
        insert(db, 'Enrollment', { cohortId: 'nope', userId: 'learner-A' })
      ).rejects.toThrow()
    })
    it('recomputes the agency on every write, ignoring one the caller sets', async () => {
      await db.query(`UPDATE "Enrollment" SET "agencyId" = 'B' WHERE id='en-A'`)
      expect((await one(`SELECT "agencyId" FROM "Enrollment" WHERE id='en-A'`)).agencyId).toBe('A')
    })
    it('keeps the agency of its cohort whatever an update tries to set', async () => {
      await db.query(`UPDATE "Enrollment" SET "agencyId" = NULL WHERE id='en-A'`)
      expect((await one(`SELECT "agencyId" FROM "Enrollment" WHERE id='en-A'`)).agencyId).toBe('A')
      await db.query(`UPDATE "Enrollment" SET "agencyId" = 'B' WHERE id='en-A'`)
      expect((await one(`SELECT "agencyId" FROM "Enrollment" WHERE id='en-A'`)).agencyId).toBe('A')
    })
  })

  describe('memberships, notes and support items', () => {
    it('use the cohort when there is one, else the institution', async () => {
      await insert(db, 'Membership', { userId: 'learner-A', institutionId: 'prov-A' })
      expect(
        (await one(`SELECT "agencyId" FROM "Membership" WHERE "institutionId"='prov-A'`)).agencyId
      ).toBe('A')
      await insert(db, 'Membership', {
        userId: 'learner-A',
        institutionId: 'prov-A',
        cohortId: 'coh-pick',
      })
      expect(
        (await one(`SELECT "agencyId" FROM "Membership" WHERE "cohortId"='coh-pick'`)).agencyId
      ).toBe('B')
      await insert(db, 'ParticipantNote', { providerId: 'prov-B', userId: 'learner-B' })
      expect((await one(`SELECT "agencyId" FROM "ParticipantNote" LIMIT 1`)).agencyId).toBe('B')
      await insert(db, 'SupportItem', {
        providerId: 'prov-A',
        userId: 'learner-A',
        cohortId: 'coh-A',
      })
      expect((await one(`SELECT "agencyId" FROM "SupportItem" LIMIT 1`)).agencyId).toBe('A')
    })

    it('give an invitation the agency of its institution, and allow one per address and place', async () => {
      await insert(db, 'RoleInvite', {
        id: 'inv-1',
        email: 'new@example.test',
        institutionId: 'prov-A',
        role: 'case-manager',
      })
      expect((await one(`SELECT "agencyId" FROM "RoleInvite" WHERE id='inv-1'`)).agencyId).toBe('A')
      await expect(
        insert(db, 'RoleInvite', {
          id: 'inv-2',
          email: 'new@example.test',
          institutionId: 'prov-A',
          role: 'provider-admin',
        })
      ).rejects.toThrow(/RoleInvite_one_per_place/)
      // the same address at another place, or for a cohort, is a different invitation
      await insert(db, 'RoleInvite', {
        id: 'inv-3',
        email: 'new@example.test',
        institutionId: 'prov-B',
        role: 'case-manager',
      })
      await insert(db, 'RoleInvite', {
        id: 'inv-4',
        email: 'new@example.test',
        institutionId: 'prov-A',
        cohortId: 'coh-A',
        role: 'instructor',
      })
      // an invitation goes when its cohort does
      await insert(db, 'Cohort', { id: 'coh-inv', institutionId: 'prov-A', name: 'x' })
      await insert(db, 'RoleInvite', {
        id: 'inv-5',
        email: 'x@example.test',
        institutionId: 'prov-A',
        cohortId: 'coh-inv',
        role: 'instructor',
      })
      await db.query(`DELETE FROM "Cohort" WHERE id='coh-inv'`)
      expect((await db.query(`SELECT 1 FROM "RoleInvite" WHERE id='inv-5'`)).rows).toHaveLength(0)
    })

    it('allow one workspace-level membership per person and institution, and one per cohort', async () => {
      await insert(db, 'Membership', { id: 'm-ws-1', userId: 'learner-A', institutionId: 'prov-B' })
      await expect(
        insert(db, 'Membership', { id: 'm-ws-2', userId: 'learner-A', institutionId: 'prov-B' })
      ).rejects.toThrow(/Membership_workspace_unique/)
      // a membership in a cohort is a different thing
      await insert(db, 'Membership', {
        id: 'm-co-1',
        userId: 'learner-A',
        institutionId: 'prov-B',
        cohortId: 'coh-B',
      })
    })

    it('keep a learner’s workspace membership, and drop the redundant cohort one, when the cohort is deleted', async () => {
      await insert(db, 'Cohort', { id: 'coh-gone2', institutionId: 'prov-A', name: 'gone' })
      await insert(db, 'Membership', {
        id: 'm-gone2',
        userId: 'learner-A',
        institutionId: 'prov-A',
        cohortId: 'coh-gone2',
      })
      await db.query(`DELETE FROM "Cohort" WHERE id = 'coh-gone2'`)
      expect((await db.query(`SELECT 1 FROM "Membership" WHERE id = 'm-gone2'`)).rows).toHaveLength(
        0
      )
      // the workspace-level one made earlier is still there
      expect(
        (
          await db.query(
            `SELECT 1 FROM "Membership" WHERE "userId"='learner-A' AND "institutionId"='prov-A' AND "cohortId" IS NULL`
          )
        ).rows.length
      ).toBeGreaterThan(0)
    })

    it('keep a learner’s only membership, without the cohort, when the cohort is deleted', async () => {
      await insert(db, 'User', { id: 'learner-solo' })
      await insert(db, 'Cohort', { id: 'coh-gone', institutionId: 'prov-A', name: 'gone' })
      await insert(db, 'Membership', {
        id: 'm-gone',
        userId: 'learner-solo',
        institutionId: 'prov-A',
        cohortId: 'coh-gone',
      })
      await db.query(`DELETE FROM "Cohort" WHERE id = 'coh-gone'`)
      expect(
        (await db.query(`SELECT "cohortId" FROM "Membership" WHERE id = 'm-gone'`)).rows
      ).toEqual([{ cohortId: null }])
    })

    it('still refuse to change the person or institution, or move to another cohort', async () => {
      await insert(db, 'Membership', {
        id: 'm-fixed',
        userId: 'learner-A',
        institutionId: 'prov-A',
        cohortId: 'coh-A',
      })
      for (const change of [
        `"userId" = 'learner-B'`,
        `"institutionId" = 'prov-B'`,
        `"cohortId" = 'coh-B'`,
      ]) {
        await expect(
          db.query(`UPDATE "Membership" SET ${change} WHERE id = 'm-fixed'`)
        ).rejects.toThrow(/cannot be changed/)
      }
    })
  })
})
