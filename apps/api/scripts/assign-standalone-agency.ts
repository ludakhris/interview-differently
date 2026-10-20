/**
 * One-time data step for GitHub issue #84 (database-level tenant isolation): every institution that
 * is not an agency must belong to one. Institutions made in standalone Interview Differently have no
 * parent; this moves them under the standalone agency (src/core/standalone-agency.ts).
 *
 * Run by hand, against the database named in DATABASE_URL. Take a backup first
 * (railway postgres pitr backup create --name pre-agency-structure) and read the dry run.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/assign-standalone-agency.ts              # dry run
 *   npx ts-node -r tsconfig-paths/register scripts/assign-standalone-agency.ts --apply --confirm-host <host>   # writes a rollback file
 *   npx ts-node -r tsconfig-paths/register scripts/assign-standalone-agency.ts --rollback <file> --confirm-host <host>
 *
 * Run it BEFORE deploying the migrations that make a parent mandatory (the deploy applies them on merge), and roll
 * back with the order in docs/tenant-isolation.md (the structure rule must be dropped first).
 *
 * Only institutions with no parent and no subdomain are touched (a workspace without an agency is reported, never moved). Agencies are left alone, as is any institution that
 * already has a parent. The rollback file lists the moved ids; --rollback clears their parent again
 * and leaves the standalone agency row in place.
 */
import './lib/owner-env'
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '../src/prisma/client'
import { readFileSync, writeFileSync } from 'fs'
import { STANDALONE_AGENCY_ID, ensureStandaloneAgency } from '../src/core/standalone-agency'
import { assertBypassesRls, dbHost, requireHostConfirmation } from './lib/db-guard'

const prisma = new PrismaClient({ adapter: prismaAdapter() })

async function orphans() {
  return prisma.institution.findMany({
    // Only institutions that are not a Learn Differently workspace (no subdomain): those are the ones made in
    // standalone Interview Differently. Anything else without an agency needs a person to decide where it belongs.
    where: { kind: { not: 'agency' }, parentId: null, subdomain: null },
    select: { id: true, name: true, kind: true, subdomain: true },
    orderBy: { name: 'asc' },
  })
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const writes = args[0] === '--rollback' || args.includes('--apply')
  if (writes) requireHostConfirmation()
  else console.log(`Database host: ${dbHost()}`)
  await assertBypassesRls(prisma)

  if (args[0] === '--rollback') {
    const file = args[1]
    if (!file) throw new Error('--rollback needs the file written by --apply')
    const ids: string[] = JSON.parse(readFileSync(file, 'utf8')).ids
    const done = await prisma.institution.updateMany({
      where: { id: { in: ids }, parentId: STANDALONE_AGENCY_ID },
      data: { parentId: null },
    })
    console.log(`Rolled back ${done.count} of ${ids.length} institutions.`)
    return
  }

  const rows = await orphans()
  console.log(`${rows.length} institutions without an agency:`)
  for (const r of rows) console.log(`  ${r.id}  ${r.kind.padEnd(12)} ${r.name}`)

  if (!args.includes('--apply')) {
    console.log(
      '\nDry run. Nothing changed. Pass --apply to move them under the standalone agency.'
    )
    return
  }

  await ensureStandaloneAgency(prisma)
  const file = `assign-standalone-agency-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(file, JSON.stringify({ ids: rows.map((r) => r.id) }, null, 2))
  const done = await prisma.institution.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, parentId: null },
    data: { parentId: STANDALONE_AGENCY_ID },
  })
  const left = (await orphans()).length
  console.log(`\nMoved ${done.count}. Still without an agency: ${left}. Rollback file: ${file}`)
  if (left > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
