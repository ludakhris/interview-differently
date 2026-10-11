import type { PGlite } from '@electric-sql/pglite'
import { appRoleGrantsSql } from './app-role-grants'
import { TENANT_TABLES, touchesTenantTable } from './tenant-tables'
import { dbTestsEnabled, insert, migratedDb } from './testing/tenant-db'

// Row-level security for tenant isolation (GitHub issue #84), run on real Postgres as the restricted role.
const suite = dbTestsEnabled ? describe : describe.skip

suite('row-level security', () => {
  let db: PGlite

  /** Runs `fn` as the restricted API role with the given request context. */
  async function as<T>(
    ctx: { agencies?: string[]; user?: string },
    fn: () => Promise<T>
  ): Promise<T> {
    await db.exec('BEGIN')
    try {
      await db.exec('SET LOCAL ROLE ld_app')
      await db.query(
        `SELECT set_config('app.agency_ids', $1, true), set_config('app.user_id', $2, true)`,
        [(ctx.agencies ?? []).join(','), ctx.user ?? '']
      )
      return await fn()
    } finally {
      await db.exec('ROLLBACK')
    }
  }
  /** Runs a statement that may be refused, and keeps the surrounding transaction usable. */
  const attempt = async (sql: string): Promise<{ error?: string; rows?: number }> => {
    await db.exec('SAVEPOINT attempt')
    try {
      const r = await db.query(sql)
      await db.exec('RELEASE SAVEPOINT attempt')
      return { rows: r.affectedRows }
    } catch (e) {
      await db.exec('ROLLBACK TO SAVEPOINT attempt')
      return { error: String((e as Error).message) }
    }
  }
  const ids = async (table: string) =>
    (await db.query<{ id: string }>(`SELECT id FROM "${table}" ORDER BY id`)).rows.map((r) => r.id)

  afterAll(() => db.close())

  beforeAll(async () => {
    db = await migratedDb()
    // The restricted role gets exactly what scripts/create-app-role.ts gives it (src/core/app-role-grants.ts).
    await db.exec(`CREATE ROLE ld_app NOLOGIN;\n${appRoleGrantsSql('ld_app').join(';\n')};`)
    for (const a of ['A', 'B']) {
      await insert(db, 'Institution', { id: a, name: a, kind: 'agency' })
      await insert(db, 'Institution', {
        id: `org-${a}`,
        name: a,
        kind: 'organization',
        parentId: a,
      })
      await insert(db, 'Institution', { id: `prov-${a}`, name: a, kind: 'provider', parentId: a })
      await insert(db, 'Course', { id: `course-${a}`, providerId: `prov-${a}`, slug: a })
      await insert(db, 'CourseModule', { id: `mod-${a}`, courseId: `course-${a}` })
      await insert(db, 'CourseItem', { id: `item-${a}`, moduleId: `mod-${a}` })
      await insert(db, 'User', { id: `learner-${a}` })
      await insert(db, 'User', { id: `staff-${a}` })
      await insert(db, 'Cohort', {
        id: `coh-${a}`,
        institutionId: `org-${a}`,
        name: a,
        joinKey: `key-${a}`,
        courseId: `course-${a}`,
      })
      await insert(db, 'Enrollment', {
        id: `en-${a}`,
        cohortId: `coh-${a}`,
        userId: `learner-${a}`,
      })
      await insert(db, 'ItemProgress', { enrollmentId: `en-${a}`, itemId: `item-${a}` })
      await insert(db, 'ParticipantNote', { providerId: `prov-${a}`, userId: `learner-${a}` })
      // staff-X holds a workspace-level membership in agency X
      await insert(db, 'Membership', {
        userId: `staff-${a}`,
        institutionId: a,
        role: 'agency-admin',
      })
    }
  })

  it('shows an agency only its own rows, in every protected table', async () => {
    await as({ agencies: ['A'] }, async () => {
      expect(await ids('Cohort')).toEqual(['coh-A'])
      expect(await ids('Enrollment')).toEqual(['en-A'])
      expect((await db.query(`SELECT 1 FROM "ItemProgress"`)).rows).toHaveLength(1)
      expect((await db.query(`SELECT 1 FROM "ParticipantNote"`)).rows).toHaveLength(1)
      expect((await db.query(`SELECT 1 FROM "Membership"`)).rows).toHaveLength(1)
    })
    await as({ agencies: ['B'] }, async () => expect(await ids('Cohort')).toEqual(['coh-B']))
  })

  it('shows several agencies to someone granted in each', async () => {
    await as({ agencies: ['A', 'B'] }, async () =>
      expect(await ids('Cohort')).toEqual(['coh-A', 'coh-B'])
    )
  })

  it('shows nothing when there is no context (fails closed)', async () => {
    await as({}, async () => {
      for (const t of ['Cohort', 'Enrollment', 'ItemProgress', 'ParticipantNote', 'Membership'])
        expect((await db.query(`SELECT 1 FROM "${t}"`)).rows).toHaveLength(0)
    })
  })

  it('lets a learner see their own records and their cohort, and nothing else', async () => {
    await as({ user: 'learner-A' }, async () => {
      expect(await ids('Enrollment')).toEqual(['en-A'])
      expect(await ids('Cohort')).toEqual(['coh-A'])
      expect((await db.query(`SELECT 1 FROM "ItemProgress"`)).rows).toHaveLength(1)
      expect((await db.query(`SELECT 1 FROM "ParticipantNote"`)).rows).toHaveLength(0)
    })
  })

  it('keeps staff notes away from a learner even in their own agency', async () => {
    await as({ user: 'learner-A' }, async () =>
      expect((await db.query(`SELECT 1 FROM "ParticipantNote"`)).rows).toHaveLength(0)
    )
  })

  it('refuses to write a row into another agency', async () => {
    await as({ agencies: ['A'] }, async () => {
      await expect(
        db.query(
          `INSERT INTO "Cohort" ("id","institutionId","name","updatedAt") VALUES ('x','org-B','x',now())`
        )
      ).rejects.toThrow(/row-level security/)
    })
  })

  it('does not let one agency change or delete another agency rows', async () => {
    await as({ agencies: ['A'] }, async () => {
      expect(
        (await db.query(`UPDATE "Cohort" SET "name"='hacked' WHERE "id"='coh-B'`)).affectedRows
      ).toBe(0)
      expect((await db.query(`DELETE FROM "Enrollment" WHERE "id"='en-B'`)).affectedRows).toBe(0)
    })
  })

  it('does not let a learner delete or change what they can only see', async () => {
    await as({ user: 'learner-A' }, async () => {
      expect((await db.query(`DELETE FROM "Cohort" WHERE id='coh-A'`)).affectedRows).toBe(0)
      expect((await db.query(`UPDATE "Cohort" SET "name"='x' WHERE id='coh-A'`)).affectedRows).toBe(
        0
      )
      expect((await db.query(`DELETE FROM "Enrollment" WHERE id='en-A'`)).affectedRows).toBe(0)
      expect((await db.query(`UPDATE "CohortSession" SET "startsAt"=now()`)).affectedRows).toBe(0)
    })
  })

  it('lets a learner write their own enrollment and progress, but not re-point or move them', async () => {
    await as({ user: 'learner-A' }, async () => {
      expect(
        (await attempt(`UPDATE "Enrollment" SET "status"='completed' WHERE id='en-A'`)).rows
      ).toBe(1)
      expect((await attempt(`UPDATE "ItemProgress" SET "status"='completed'`)).rows).toBe(1)
      expect(
        (await attempt(`UPDATE "Enrollment" SET "cohortId"='coh-B' WHERE id='en-A'`)).error
      ).toMatch(/cannot be changed/)
      await attempt(`UPDATE "Enrollment" SET "agencyId"='B' WHERE id='en-A'`)
      const r = await db.query<{ agencyId: string }>(
        `SELECT "agencyId" FROM "Enrollment" WHERE id='en-A'`
      )
      expect(r.rows[0].agencyId).toBe('A')
    })
  })

  it('keeps a learner from granting themselves an agency', async () => {
    await as({ user: 'learner-A' }, async () => {
      expect(
        (
          await attempt(
            `INSERT INTO "Membership" ("id","userId","institutionId","role") VALUES ('g1','learner-A','B','agency-admin')`
          )
        ).error
      ).toBeDefined()
      await db.query(
        `INSERT INTO "Membership" ("id","userId","institutionId") VALUES ('m-self','learner-A','org-A')`
      )
      expect(
        (await attempt(`UPDATE "Membership" SET "role"='agency-admin' WHERE id='m-self'`)).error
      ).toBeDefined()
      expect((await db.query(`SELECT "agencies_of_user"('learner-A') AS a`)).rows[0]).toEqual({
        a: [],
      })
    })
  })

  it('lets a person add a plain membership in their own name', async () => {
    await as({ user: 'learner-A' }, async () => {
      await db.query(
        `INSERT INTO "Membership" ("id","userId","institutionId") VALUES ('m-own','learner-A','org-A')`
      )
      expect((await db.query(`SELECT 1 FROM "Membership" WHERE id='m-own'`)).rows).toHaveLength(1)
    })
  })

  it('counts an instructor’s cohort membership as access to its agency, and a learner’s as none', async () => {
    await db.exec('BEGIN')
    try {
      await insert(db, 'User', { id: 'instr-A' })
      await insert(db, 'User', { id: 'learn-B' })
      await db.query(
        `INSERT INTO "Membership" ("id","userId","institutionId","cohortId","role") VALUES ('m-instr','instr-A','org-A','coh-A','instructor')`
      )
      await db.query(
        `INSERT INTO "Membership" ("id","userId","institutionId","cohortId") VALUES ('m-learn','learn-B','org-A','coh-A')`
      )
      expect((await db.query(`SELECT "agencies_of_user"('instr-A') AS a`)).rows[0]).toEqual({
        a: ['A'],
      })
      expect((await db.query(`SELECT "agencies_of_user"('learn-B') AS a`)).rows[0]).toEqual({
        a: [],
      })
    } finally {
      await db.exec('ROLLBACK')
    }
  })

  it('lets a cohort with members be deleted, and an instructor left without a cohort grants nothing', async () => {
    await db.exec('BEGIN')
    try {
      await insert(db, 'User', { id: 'instr-gone' })
      await insert(db, 'Cohort', { id: 'coh-doomed', institutionId: 'org-A', name: 'doomed' })
      await db.query(
        `INSERT INTO "Membership" ("id","userId","institutionId","cohortId","role") VALUES ('m-gone','instr-gone','org-A','coh-doomed','instructor')`
      )
      expect((await db.query(`SELECT "agencies_of_user"('instr-gone') AS a`)).rows[0]).toEqual({
        a: ['A'],
      })
      // deleting the cohort clears the link on its memberships; the delete must go through
      await db.query(`DELETE FROM "Cohort" WHERE id = 'coh-doomed'`)
      expect(
        (await db.query(`SELECT "cohortId" FROM "Membership" WHERE id = 'm-gone'`)).rows[0]
      ).toEqual({ cohortId: null })
      expect((await db.query(`SELECT "agencies_of_user"('instr-gone') AS a`)).rows[0]).toEqual({
        a: [],
      })
    } finally {
      await db.exec('ROLLBACK')
    }
  })

  it('shows an invitation only to people holding a role in its agency', async () => {
    await db.exec('BEGIN')
    try {
      await insert(db, 'RoleInvite', {
        id: 'inv-rls',
        email: 'x@example.test',
        institutionId: 'org-A',
        role: 'case-manager',
      })
      await as({ agencies: ['A'] }, async () => {
        expect((await db.query(`SELECT 1 FROM "RoleInvite" WHERE id='inv-rls'`)).rows).toHaveLength(
          1
        )
      })
      await as({ agencies: ['B'] }, async () => {
        expect((await db.query(`SELECT 1 FROM "RoleInvite" WHERE id='inv-rls'`)).rows).toHaveLength(
          0
        )
        expect(
          (
            await attempt(
              `INSERT INTO "RoleInvite" ("id","email","institutionId","role") VALUES ('inv-x','y@example.test','org-A','case-manager')`
            )
          ).error
        ).toBeDefined()
      })
      await as({ user: 'learner-A' }, async () => {
        expect((await db.query(`SELECT 1 FROM "RoleInvite"`)).rows).toHaveLength(0)
      })
    } finally {
      await db.exec('ROLLBACK')
    }
  })

  it('does not apply to the database owner (migrations, seeds)', async () => {
    expect(await ids('Cohort')).toEqual(['coh-A', 'coh-B'])
  })

  it('gives the restricted role only the functions the API needs', async () => {
    await as({}, async () => {
      expect((await db.query(`SELECT "agencies_of_user"('staff-A') AS a`)).rows[0]).toEqual({
        a: ['A'],
      })
      expect((await db.query(`SELECT "all_agency_ids"() AS a`)).rows[0]).toEqual({ a: ['A', 'B'] })
      for (const fn of [`"agency_of_institution"('org-A')`]) {
        expect((await attempt(`SELECT ${fn}`)).error).toMatch(/permission denied|does not exist/)
      }
      expect((await attempt(`SELECT * FROM "cohort_by_join_key"('key-B')`)).error).toMatch(
        /does not exist/
      )
    })
  })

  it('cannot shadow a table or function with one it creates itself', async () => {
    await as({ agencies: ['A'] }, async () => {
      expect(
        (await attempt(`CREATE TEMP TABLE "Cohort" (id text, "agencyId" text)`)).error
      ).toMatch(/permission denied/)
    })
  })

  describe('self-enrolment and joining', () => {
    beforeAll(async () => {
      await insert(db, 'Cohort', {
        id: 'coh-open',
        institutionId: 'org-A',
        name: 'open',
        courseId: 'course-A',
      })
      await insert(db, 'Cohort', {
        id: 'coh-approval',
        institutionId: 'org-A',
        name: 'needs approval',
        courseId: 'course-A',
        requiresApproval: true,
      })
      await insert(db, 'Cohort', {
        id: 'coh-full',
        institutionId: 'org-A',
        name: 'full',
        courseId: 'course-A',
        maxLearners: 1,
      })
      await insert(db, 'User', { id: 'learner-X' })
      await insert(db, 'User', { id: 'learner-Y' })
      await insert(db, 'Enrollment', { id: 'en-full', cohortId: 'coh-full', userId: 'learner-Y' })
    })
    const enrol = (cohort: string) =>
      `INSERT INTO "Enrollment" ("id","cohortId","userId") VALUES (gen_random_uuid()::text,'${cohort}','learner-X')`

    it('lets a person enrol where no approval is needed and there is room', async () => {
      await as({ user: 'learner-X' }, async () =>
        expect((await attempt(enrol('coh-open'))).error).toBeUndefined()
      )
    })
    it('refuses a self-enrolment that skips approval or capacity (the join code itself is checked by the API)', async () => {
      await as({ user: 'learner-X' }, async () => {
        expect((await attempt(enrol('coh-approval'))).error).toMatch(/row-level security/)
        expect((await attempt(enrol('coh-full'))).error).toMatch(/row-level security/)
      })
    })
    it('lets a person ask to join only a cohort that needs approval', async () => {
      const ask = (cohort: string) =>
        `INSERT INTO "JoinRequest" ("id","cohortId","userId","updatedAt") VALUES (gen_random_uuid()::text,'${cohort}','learner-X', now())`
      await as({ user: 'learner-X' }, async () => {
        expect((await attempt(ask('coh-open'))).error).toMatch(/row-level security/)
        expect((await attempt(ask('coh-approval'))).error).toBeUndefined()
      })
    })
    it('keeps a plain cohort membership to a cohort the person could enrol in', async () => {
      const join = (cohort: string) =>
        `INSERT INTO "Membership" ("id","userId","institutionId","cohortId") VALUES (gen_random_uuid()::text,'learner-X','org-A','${cohort}')`
      await as({ user: 'learner-X' }, async () => {
        expect((await attempt(join('coh-approval'))).error).toMatch(/row-level security/)
        expect((await attempt(join('coh-open'))).error).toBeUndefined()
      })
    })
    it('logs activity only against the person own enrolment', async () => {
      const log = (enrollment: string) =>
        `INSERT INTO "ActivitySession" ("id","enrollmentId","userId","itemId","day") VALUES (gen_random_uuid()::text,'${enrollment}','learner-A','item-A', current_date)`
      await as({ user: 'learner-A' }, async () => {
        expect((await attempt(log('en-B'))).error).toMatch(/row-level security|violates/)
      })
    })
  })

  describe('courses are private to their agency', () => {
    const courses = () => ids('Course')
    it('shows an agency its own courses, modules and items, and none of another', async () => {
      await as({ agencies: ['A'] }, async () => {
        expect(await courses()).toEqual(['course-A'])
        expect(await ids('CourseModule')).toEqual(['mod-A'])
        expect(await ids('CourseItem')).toEqual(['item-A'])
      })
      await as({ agencies: ['B'] }, async () => expect(await courses()).toEqual(['course-B']))
    })
    it('shows a learner the course their cohort runs, and no other', async () => {
      await as({ user: 'learner-A' }, async () => {
        expect(await courses()).toEqual(['course-A'])
        expect(await ids('CourseItem')).toEqual(['item-A'])
      })
    })
    it('shows nothing without a context, and keeps writes to the agency', async () => {
      await as({}, async () => expect(await courses()).toEqual([]))
      await as({ user: 'learner-A' }, async () => {
        expect((await attempt(`UPDATE "Course" SET "title"='x' WHERE id='course-A'`)).rows).toBe(0)
        expect((await attempt(`DELETE FROM "CourseItem" WHERE id='item-A'`)).rows).toBe(0)
      })
      await as({ agencies: ['B'] }, async () =>
        expect((await attempt(`UPDATE "Course" SET "title"='x' WHERE id='course-A'`)).rows).toBe(0)
      )
    })
    it('shows a course offered to an institution of the agency', async () => {
      await db.query(
        `INSERT INTO "CourseOffer" ("courseId","institutionId") VALUES ('course-B','org-A')`
      )
      await as({ agencies: ['A'] }, async () =>
        expect(await courses()).toEqual(['course-A', 'course-B'])
      )
      await db.query(`DELETE FROM "CourseOffer" WHERE "courseId"='course-B'`)
      await as({ agencies: ['A'] }, async () => expect(await courses()).toEqual(['course-A']))
    })
    it('shows an organization in another agency the course its cohort runs', async () => {
      // another agency's course can only be run by an institution it has been offered to
      await db.query(
        `INSERT INTO "CourseOffer" ("courseId","institutionId") VALUES ('course-A','org-B')`
      )
      await insert(db, 'Cohort', {
        id: 'coh-host',
        institutionId: 'org-B',
        name: 'h',
        courseId: 'course-A',
      })
      await as({ agencies: ['B'] }, async () =>
        expect(await courses()).toEqual(['course-A', 'course-B'])
      )
      await db.query(`DELETE FROM "Cohort" WHERE id='coh-host'`)
      await db.query(`DELETE FROM "CourseOffer"`)
    })
  })

  describe('course offers', () => {
    it('are visible to the offering agency and to the institution they are offered to, and nobody else', async () => {
      await db.query(
        `INSERT INTO "CourseOffer" ("courseId","institutionId") VALUES ('course-B','org-A')`
      )
      await as({ agencies: ['B'] }, async () =>
        expect((await db.query(`SELECT 1 FROM "CourseOffer"`)).rows).toHaveLength(1)
      )
      await as({ agencies: ['A'] }, async () =>
        expect((await db.query(`SELECT 1 FROM "CourseOffer"`)).rows).toHaveLength(1)
      )
      await as({ user: 'learner-A' }, async () =>
        expect((await db.query(`SELECT 1 FROM "CourseOffer"`)).rows).toHaveLength(0)
      )
      await db.query(`DELETE FROM "CourseOffer"`)
    })
    it('can be made only by the agency that owns the course', async () => {
      await as({ agencies: ['A'] }, async () => {
        const r = await attempt(
          `INSERT INTO "CourseOffer" ("courseId","institutionId") VALUES ('course-B','org-A')`
        )
        expect(r.error).toMatch(/row-level security/)
      })
      await as({ agencies: ['B'] }, async () => {
        const r = await attempt(
          `INSERT INTO "CourseOffer" ("courseId","institutionId") VALUES ('course-B','org-A')`
        )
        expect(r.error).toBeUndefined()
      })
    })
    it('a provider cannot run its own course in another agency without an offer', async () => {
      await expect(
        insert(db, 'Cohort', {
          id: 'coh-own',
          institutionId: 'prov-A',
          name: 'x',
          courseId: 'course-A',
          agencyId: 'B',
        })
      ).rejects.toThrow(/not been offered/)
    })
    it('are required for a cohort to run another agency course', async () => {
      await expect(
        insert(db, 'Cohort', {
          id: 'coh-cross',
          institutionId: 'org-A',
          name: 'x',
          courseId: 'course-B',
        })
      ).rejects.toThrow(/not been offered/)
      await db.query(
        `INSERT INTO "CourseOffer" ("courseId","institutionId") VALUES ('course-B','org-A')`
      )
      await insert(db, 'Cohort', {
        id: 'coh-cross',
        institutionId: 'org-A',
        name: 'x',
        courseId: 'course-B',
      })
      await db.query(`DELETE FROM "Cohort" WHERE id='coh-cross'`)
      await db.query(`DELETE FROM "CourseOffer"`)
    })
  })

  it('lists exactly the tables that have a policy', async () => {
    const r = await db.query<{ tablename: string }>(
      `SELECT DISTINCT tablename FROM pg_policies WHERE policyname = 'tenant_read' ORDER BY 1`
    )
    expect(r.rows.map((x) => x.tablename)).toEqual([...TENANT_TABLES].sort())
  })
})

describe('touchesTenantTable', () => {
  it('is true for a tenant table, and for a query that reaches one through a relation', () => {
    expect(touchesTenantTable('Cohort', {})).toBe(true)
    expect(touchesTenantTable('Course', { include: { cohorts: true } })).toBe(true)
    expect(
      touchesTenantTable('Institution', { where: { memberships: { some: { userId: 'u' } } } })
    ).toBe(true)
    expect(
      touchesTenantTable('AssessmentDelivery', { select: { cohort: { select: { id: true } } } })
    ).toBe(true)
    expect(touchesTenantTable('Scenario', { select: { nodes: true } })).toBe(false)
  })
  it('is false for a query that stays off the tenant tables', () => {
    expect(touchesTenantTable('Institution', { where: { subdomain: 'x' } })).toBe(false)
    expect(
      touchesTenantTable('Dataset', { where: { slug: 'p' }, orderBy: { createdAt: 'desc' } })
    ).toBe(false)
    expect(touchesTenantTable('Scenario', undefined)).toBe(false)
  })
})
