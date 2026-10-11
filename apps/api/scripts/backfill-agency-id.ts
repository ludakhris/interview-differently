/**
 * One-time data step for GitHub issue #84 (database-level tenant isolation): fill `agencyId` on rows
 * that existed before the column did. New rows get it from database triggers; this touches every row
 * that is still empty so the same triggers fill it, parents before children.
 *
 * Run by hand against the database named in DATABASE_URL, after scripts/assign-standalone-agency.ts:
 *   1. Take a backup (railway postgres pitr backup create --name pre-agency-id) and lock it.
 *   2. npx ts-node -r tsconfig-paths/register scripts/backfill-agency-id.ts           # dry run, changes nothing
 *   3. npx ts-node -r tsconfig-paths/register scripts/backfill-agency-id.ts --apply --confirm-host <host>   # fills the column
 * To undo, run prisma/rollbacks/20261014100000_agency_id.down.sql, or restore the backup.
 *
 * Exits 1 if any row is left without an agency (an institution that still has no agency).
 */
import './lib/owner-env'
import { PrismaClient } from '@prisma/client'
import { STANDALONE_AGENCY_ID } from '../src/core/standalone-agency'
import { assertBypassesRls, dbHost, requireHostConfirmation } from './lib/db-guard'

// Parents first: children copy their parent's agency.
const TABLES = [
  'Course',
  'CourseOffer',
  'CourseModule',
  'CourseItem',
  'Cohort',
  'Enrollment',
  'JoinRequest',
  'CohortSession',
  'ItemProgress',
  'ItemAttempt',
  'PlanItem',
  'ActivitySession',
  'AttendanceMark',
  'Membership',
  'ParticipantNote',
  'SupportItem',
]

const prisma = new PrismaClient()

async function empty(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM "${table}" WHERE "agencyId" IS NULL`
  )
  return rows[0].n
}

/**
 * Workspace-level memberships outside standalone Interview Differently are, in Learn Differently, how staff are bound
 * to a provider, organization or agency. Only role-bearing memberships give a person an agency's data, so the
 * ones that exist today have to be marked. That is a decision about people, so this lists exactly who would be
 * marked (Learn Differently accounts only) and does nothing unless --promote-grants is passed after you have read it.
 */
const GRANT_WHERE = `m."cohortId" IS NULL AND m."role" IS NULL
  AND u."source" = 'learn'
  AND "agency_of_institution"(m."institutionId") IS NOT NULL
  AND "agency_of_institution"(m."institutionId") <> '${STANDALONE_AGENCY_ID}'`

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  if (apply) requireHostConfirmation()
  else console.log(`Database host: ${dbHost()}`)
  await assertBypassesRls(prisma)
  console.log(
    apply ? 'Applying.\n' : 'Dry run. Nothing is changed. Pass --apply to fill the column.\n'
  )

  const candidates = await prisma.$queryRawUnsafe<
    { id: string; userId: string; email: string | null; institution: string }[]
  >(
    `SELECT m."id", m."userId", u."email", i."name" AS institution
       FROM "Membership" m JOIN "User" u ON u."id" = m."userId" JOIN "Institution" i ON i."id" = m."institutionId"
      WHERE ${GRANT_WHERE} ORDER BY i."name", u."email"`
  )
  console.log(`${candidates.length} workspace-level memberships would become staff grants:`)
  for (const c of candidates) console.log(`  ${c.email ?? c.userId}  ->  ${c.institution}`)
  if (apply && process.argv.includes('--promote-grants') && candidates.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Membership" m SET "role" = 'staff' FROM "User" u WHERE u."id" = m."userId" AND ${GRANT_WHERE}`
    )
    console.log('Marked as staff grants.\n')
  } else if (candidates.length > 0) {
    console.log('Not marked (pass --promote-grants with --apply once you have checked the list).\n')
  }

  let left = 0
  for (const table of TABLES) {
    const before = await empty(table)
    if (apply && before > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE "${table}" SET "agencyId" = "agencyId" WHERE "agencyId" IS NULL`
      )
    }
    const after = apply ? await empty(table) : before
    left += after
    console.log(
      `${table.padEnd(16)} ${String(before).padStart(7)} empty` +
        (apply ? `  ->  ${String(after).padStart(7)} still empty` : '')
    )
  }

  if (apply) {
    console.log(left === 0 ? '\nEvery row has an agency.' : `\n${left} rows still have no agency.`)
    if (left > 0) process.exitCode = 1
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
