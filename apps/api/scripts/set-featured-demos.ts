/**
 * Marks the demo providers that have full sample data (attendance, talent, activity, notes) as
 * featured, so the workspace chooser stars them: Cedar Mill Trades Institute and Lantern Hill
 * Tech Academy. Safe to run again: it only changes a row that is not yet marked.
 *
 * Usage (from apps/api):
 *   npm run set:featured-demos -- --dry-run              # show what would change
 *   npm run set:featured-demos                           # mark them
 *   npm run set:featured-demos -- --allow-host <host>    # run against a non-dev database
 *
 * Refuses to run unless DATABASE_URL points at localhost or the Railway dev database. Pass
 * --allow-host for production only with the owner's OK.
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const DEV_HOSTS = ['localhost', '127.0.0.1', 'zephyr.proxy.rlwy.net']
const FEATURED_IDS = ['demo-inst-cedar-mill', 'demo-inst-lantern-hill']

function targetHost(allowHost: string | undefined): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const host = new URL(url).hostname
  if (DEV_HOSTS.includes(host) || host === allowHost) return host
  throw new Error(
    `DATABASE_URL points at ${host}, which is not a development database. ` +
      `Pass --allow-host ${host} only with the owner's OK.`
  )
}

async function main() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--allow-host')
  const host = targetHost(i >= 0 ? argv[i + 1] : undefined)
  const dryRun = argv.includes('--dry-run')
  const prisma = new PrismaClient()
  try {
    console.log(`Database: ${host}${dryRun ? ' (dry run: nothing is written)' : ''}`)
    const rows = await prisma.institution.findMany({
      where: { id: { in: FEATURED_IDS } },
      select: { id: true, name: true, featuredDemo: true },
    })
    for (const id of FEATURED_IDS) {
      const row = rows.find((r) => r.id === id)
      if (!row) console.log(`  ${id}: not found`)
      else if (row.featuredDemo) console.log(`  ${row.name} (${id}): already featured`)
      else {
        if (!dryRun)
          await prisma.institution.update({ where: { id }, data: { featuredDemo: true } })
        console.log(`  ${row.name} (${id}): ${dryRun ? 'would mark' : 'marked'} featured`)
      }
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
