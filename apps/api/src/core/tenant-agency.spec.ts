import type { PGlite } from '@electric-sql/pglite'
import { dbTestsEnabled, insert, migratedDb } from './testing/tenant-db'

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

  describe('rows that predate the agency columns (the window between the deploy and the backfill)', () => {
    it('can still be written, are left without an agency, and are filled by the backfill, parents first', async () => {
      // A legacy cohort, enrolment and progress row, as they were before the migration: no agencyId anywhere.
      await insert(db, 'CourseModule', { id: 'mod-legacy', courseId: 'course-A' })
      await insert(db, 'CourseItem', { id: 'item-legacy', moduleId: 'mod-legacy' })
      await insert(db, 'Cohort', { id: 'coh-legacy', institutionId: 'org-A', name: 'legacy' })
      await insert(db, 'Enrollment', {
        id: 'en-legacy',
        cohortId: 'coh-legacy',
        userId: 'learner-A',
      })
      await insert(db, 'ItemProgress', {
        id: 'ip-legacy',
        enrollmentId: 'en-legacy',
        itemId: 'item-legacy',
      })
      await db.query(`ALTER TABLE "Cohort" DISABLE TRIGGER USER`)
      await db.query(`ALTER TABLE "Enrollment" DISABLE TRIGGER USER`)
      await db.query(`ALTER TABLE "ItemProgress" DISABLE TRIGGER USER`)
      await db.query(`UPDATE "Cohort" SET "agencyId" = NULL WHERE id='coh-legacy'`)
      await db.query(`UPDATE "Enrollment" SET "agencyId" = NULL WHERE id='en-legacy'`)
      await db.query(`UPDATE "ItemProgress" SET "agencyId" = NULL WHERE id='ip-legacy'`)
      await db.query(`ALTER TABLE "Cohort" ENABLE TRIGGER USER`)
      await db.query(`ALTER TABLE "Enrollment" ENABLE TRIGGER USER`)
      await db.query(`ALTER TABLE "ItemProgress" ENABLE TRIGGER USER`)
      // The cohort's own trigger can fill its agency, but a child whose parent has none is not an error: it waits.
      await db.query(`ALTER TABLE "Cohort" DISABLE TRIGGER USER`)
      await db.query(`UPDATE "Enrollment" SET "status" = 'completed' WHERE id='en-legacy'`)
      await db.query(`UPDATE "ItemProgress" SET "status" = 'completed' WHERE id='ip-legacy'`)
      await db.query(`ALTER TABLE "Cohort" ENABLE TRIGGER USER`)
      expect(
        (await one(`SELECT "agencyId" FROM "Enrollment" WHERE id='en-legacy'`)).agencyId
      ).toBeNull()
      // The backfill touches every empty row, parents first, and the same triggers fill them in.
      await db.query(`UPDATE "Cohort" SET "agencyId" = "agencyId" WHERE "agencyId" IS NULL`)
      await db.query(`UPDATE "Enrollment" SET "agencyId" = "agencyId" WHERE "agencyId" IS NULL`)
      await db.query(`UPDATE "ItemProgress" SET "agencyId" = "agencyId" WHERE "agencyId" IS NULL`)
      for (const [t, id] of [
        ['Cohort', 'coh-legacy'],
        ['Enrollment', 'en-legacy'],
        ['ItemProgress', 'ip-legacy'],
      ]) {
        expect((await one(`SELECT "agencyId" FROM "${t}" WHERE id='${id}'`)).agencyId).toBe('A')
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
      await insert(db, 'ActivitySession', { ...item, userId: 'learner-A' })
      await insert(db, 'AttendanceMark', { sessionId: 'se-A', userId: 'learner-A' })
      for (const t of [
        'ItemProgress',
        'ItemAttempt',
        'PlanItem',
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
    it('fills a missing value when an old row is touched', async () => {
      await db.query(`ALTER TABLE "Enrollment" DISABLE TRIGGER "Enrollment_set_agency"`)
      await db.query(`UPDATE "Enrollment" SET "agencyId" = NULL WHERE id='en-A'`)
      await db.query(`ALTER TABLE "Enrollment" ENABLE TRIGGER "Enrollment_set_agency"`)
      await db.query(`UPDATE "Enrollment" SET "agencyId" = "agencyId" WHERE "agencyId" IS NULL`)
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

    it('keep a learner’s membership, without the cohort, when the cohort is deleted', async () => {
      await insert(db, 'Cohort', { id: 'coh-gone', institutionId: 'prov-A', name: 'gone' })
      await insert(db, 'Membership', {
        id: 'm-gone',
        userId: 'learner-A',
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
