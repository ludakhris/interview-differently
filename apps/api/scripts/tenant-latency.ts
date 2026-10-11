/**
 * What row-level security costs per query, split into the part that depends on the network and the part that
 * does not (GitHub issue #84). Read only: it runs SELECT, EXPLAIN ANALYZE and set_config, never a write.
 *
 *   DATABASE_URL=<restricted role url> SCHEMA_DATABASE_URL=<owner url> \
 *     npx ts-node -r tsconfig-paths/register scripts/tenant-latency.ts
 *
 * Run it from the machine you want to judge (for example inside the deployment, so the round trip is the real
 * one). A query with row-level security on takes four round trips (begin, set the context, query, commit);
 * without it, one.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { dbHost } from './lib/db-guard'

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const QUERIES: [string, string][] = [
  ['count of cohorts', `SELECT count(*) FROM "Cohort"`],
  ['50 enrollments', `SELECT * FROM "Enrollment" ORDER BY "enrolledAt" LIMIT 50`],
  [
    'progress rows of 100 enrollments',
    `SELECT * FROM "ItemProgress" WHERE "enrollmentId" IN (SELECT "id" FROM "Enrollment" LIMIT 100)`,
  ],
]

async function serverMs(
  db: PrismaClient,
  sql: string,
  ctx?: { ids: string; user: string }
): Promise<number> {
  const times: number[] = []
  for (let i = 0; i < 15; i++) {
    const run = async (tx: PrismaClient) => {
      if (ctx)
        await tx.$executeRaw`SELECT set_config('app.agency_ids', ${ctx.ids}, true), set_config('app.user_id', ${ctx.user}, true)`
      const rows = await tx.$queryRawUnsafe<
        { 'QUERY PLAN': { 'Planning Time': number; 'Execution Time': number }[] }[]
      >(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`)
      const plan = rows[0]['QUERY PLAN'][0]
      times.push(plan['Planning Time'] + plan['Execution Time'])
    }
    await db.$transaction(async (tx) => run(tx as unknown as PrismaClient))
  }
  return median(times)
}

async function main(): Promise<void> {
  console.log(`Database host: ${dbHost()}`)
  const restricted = new PrismaClient()
  const owner = new PrismaClient({ datasourceUrl: process.env.SCHEMA_DATABASE_URL })
  const ids = (
    await owner.$queryRawUnsafe<{ ids: string }[]>(
      `SELECT string_agg("id", ',') AS ids FROM "Institution" WHERE "kind" = 'agency'`
    )
  )[0].ids

  // Round trip: a query that does nothing.
  const rtts: number[] = []
  await restricted.$queryRawUnsafe('SELECT 1')
  for (let i = 0; i < 30; i++) {
    const t = performance.now()
    await restricted.$queryRawUnsafe('SELECT 1')
    rtts.push(performance.now() - t)
  }
  const rtt = median(rtts)
  console.log(`\nOne round trip from here: ${rtt.toFixed(1)} ms (median of 30)\n`)

  console.log('Database-side time per query (planning + execution, no network):')
  const server: { name: string; plain: number; rls: number }[] = []
  for (const [name, sql] of QUERIES) {
    const plain = await serverMs(owner, sql)
    const rls = await serverMs(restricted, sql, { ids, user: 'latency-check' })
    server.push({ name, plain, rls })
    console.log(`  ${name.padEnd(36)} no RLS ${plain.toFixed(2)} ms   RLS ${rls.toFixed(2)} ms`)
  }
  const avgPlain = server.reduce((s, x) => s + x.plain, 0) / server.length
  const avgRls = server.reduce((s, x) => s + x.rls, 0) / server.length

  console.log('\nWhat one query costs, by round trip time (database-side work from above):')
  console.log('  round trip   without RLS (1 trip)   with RLS (4 trips)   ratio')
  for (const r of [0.5, 1, 2, 5, 13, Math.round(rtt)]) {
    const plain = r + avgPlain
    const rls = 4 * r + avgRls
    console.log(
      `  ${String(r).padStart(6)} ms   ${plain.toFixed(1).padStart(14)} ms   ${rls.toFixed(1).padStart(14)} ms   ${(rls / plain).toFixed(1)}x${r === Math.round(rtt) ? '   <- measured here' : ''}`
    )
  }
  await restricted.$disconnect()
  await owner.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
