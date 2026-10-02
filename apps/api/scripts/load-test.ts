/**
 * Read/write load test against the tables the app hammers hardest: the
 * append-only logs (SqlQueryLog, UsageEvent) plus the admin views that read
 * them (sandbox activity, usage dashboard). Not the whole app — one hot path.
 *
 * It drives the real service classes against a real Postgres (no HTTP, no
 * Clerk), so it measures query + pool behaviour, which is what falls over.
 * NEVER point it at production: it seeds millions of rows and `clean` deletes
 * everything it created (prefixed ids `lt_`).
 *
 *   DATABASE_URL=postgresql://…/loadtest?connection_limit=10 \
 *     npm run load-test -w @id/api -- seed --users 5000 --logs 2000000 --events 1000000
 *   DATABASE_URL=… npm run load-test -w @id/api -- run --seconds 20 --writers 48 --readers 4
 *   DATABASE_URL=… npm run load-test -w @id/api -- clean
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
// USE_DIST=1 (after `npm run build`) exercises the compiled code, which is the only
// way the dashboard's worker thread is used — ts-node runs it in-process.
const base = process.env.USE_DIST ? '../dist' : '../src'
/* eslint-disable @typescript-eslint/no-var-requires */
const { ToolsService } = require(`${base}/tools/tools.service`)
const { UsageEventsService } = require(`${base}/usage/usage-events.service`)
const { UsageService } = require(`${base}/usage/usage.service`)

const [cmd = 'run', ...rest] = process.argv.slice(2)
const flag = (name: string, dflt: number): number => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? Number(rest[i + 1]) : dflt
}

const prisma = new PrismaClient()
// Clerk isn't reachable in a load test; roles are irrelevant to the DB path.
const clerk = { isAdmin: async () => false, getRoles: async () => new Map() } as never
const tools = new ToolsService(prisma as never, clerk)
const events = new UsageEventsService(prisma as never)
const usage = new UsageService(prisma as never, clerk)

async function seed() {
  const users = flag('users', 5000)
  const cohorts = flag('cohorts', 40)
  const logs = flag('logs', 2_000_000)
  const evts = flag('events', 1_000_000)
  const t0 = Date.now()
  console.log(`Seeding ${users} users, ${cohorts} cohorts, ${logs} sql logs, ${evts} usage events…`)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Institution"(id,name,"createdAt","updatedAt") VALUES ('lt_inst','LoadTest U',now(),now())
    ON CONFLICT DO NOTHING`)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Cohort"(id,"institutionId",name,"createdAt","updatedAt")
    SELECT 'lt_c'||g,'lt_inst','Cohort '||g,now(),now() FROM generate_series(1,${cohorts}) g
    ON CONFLICT DO NOTHING`)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "User"(id,email,"displayName","createdAt","updatedAt")
    SELECT 'lt_u'||g,'lt_u'||g||'@loadtest.dev','Student '||g,now(),now() FROM generate_series(1,${users}) g
    ON CONFLICT DO NOTHING`)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Membership"(id,"userId","institutionId","cohortId","createdAt")
    SELECT gen_random_uuid()::text,'lt_u'||g,'lt_inst','lt_c'||(1+g%${cohorts}),now() FROM generate_series(1,${users}) g
    ON CONFLICT DO NOTHING`)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "SqlQueryLog"(id,"userId","cohortId","datasetSlug","queryText",ok,"rowCount","durationMs","createdAt")
    SELECT gen_random_uuid()::text,'lt_u'||(1+g%${users}),'lt_c'||(1+g%${cohorts}),'sql-fundamentals',
           'SELECT * FROM customers WHERE id = '||g||' ORDER BY name LIMIT 50 -- '||md5(g::text), g%7<>0, g%50, g%400,
           now() - (random()*interval '89 days')
    FROM generate_series(1,${logs}) g`)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "UsageEvent"(id,"userId",route,"refId","createdAt")
    SELECT gen_random_uuid()::text,'lt_u'||(1+g%${users}),
           (ARRAY['/dashboard','/scenario/:id/play','/tools/sql','/tools/assessments'])[1+g%4],NULL,
           now() - (random()*interval '89 days')
    FROM generate_series(1,${evts}) g`)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "SimulationAttempt"(id,"userId","scenarioId",track,"startedAt")
    SELECT gen_random_uuid()::text,'lt_u'||(1+g%${users}),'sc-'||(g%20),'general',now() - (random()*interval '89 days')
    FROM generate_series(1,${Math.round(logs / 10)}) g`)
  await prisma.$executeRawUnsafe('ANALYZE')
  console.log(`Seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

async function clean() {
  await prisma.$executeRawUnsafe(`DELETE FROM "SqlQueryLog" WHERE "userId" LIKE 'lt\\_%'`)
  await prisma.$executeRawUnsafe(`DELETE FROM "UsageEvent" WHERE "userId" LIKE 'lt\\_%'`)
  await prisma.$executeRawUnsafe(`DELETE FROM "SimulationAttempt" WHERE "userId" LIKE 'lt\\_%'`)
  await prisma.$executeRawUnsafe(`DELETE FROM "Institution" WHERE id = 'lt_inst'`) // cascades cohorts + memberships
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE 'lt\\_%'`)
  console.log('Cleaned load-test data')
}

type Stat = { ms: number[]; errors: number }
const stats: Record<string, Stat> = {}
async function timed(name: string, fn: () => Promise<unknown>) {
  const s = (stats[name] ??= { ms: [], errors: 0 })
  const t = performance.now()
  try {
    await fn()
    s.ms.push(performance.now() - t)
  } catch (e) {
    s.errors++
    if (s.errors === 1) console.error(`[${name}] first error:`, (e as Error).message.slice(0, 200))
  }
}
const pct = (a: number[], p: number) =>
  a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN

async function run() {
  const seconds = flag('seconds', 20)
  const writers = flag('writers', 48)
  const readers = flag('readers', 4)
  const heavy = flag('heavy', 1) // usage-dashboard loops
  const users = await prisma.user.count({ where: { id: { startsWith: 'lt_' } } })
  const cohorts = await prisma.cohort.count({ where: { id: { startsWith: 'lt_' } } })
  if (!users) throw new Error('No load-test data: run `seed` first')
  const rnd = (n: number) => 1 + Math.floor(Math.random() * n)
  const end = Date.now() + seconds * 1000
  console.log(
    `Running ${seconds}s: ${writers} writers, ${readers} cohort-readers, ${heavy} dashboard-readers`
  )

  const loops: Promise<void>[] = []
  for (let i = 0; i < writers; i++)
    loops.push(
      (async () => {
        while (Date.now() < end) {
          const u = `lt_u${rnd(users)}`
          await timed('write sql-log', () =>
            tools.logSandboxQuery(u, {
              datasetSlug: 'sql-fundamentals',
              queryText: 'SELECT 1',
              ok: true,
            })
          )
          await timed('write page-view', () =>
            events.recordPageView(`lt_w${i}_${rnd(1e6)}`, '/dashboard')
          )
        }
      })()
    )
  for (let i = 0; i < readers; i++)
    loops.push(
      (async () => {
        while (Date.now() < end) {
          await timed('read cohort activity', () => tools.sandboxActivity(`lt_c${rnd(cohorts)}`))
        }
      })()
    )
  for (let i = 0; i < heavy; i++)
    loops.push(
      (async () => {
        while (Date.now() < end) {
          await timed('read usage dashboard', () =>
            // Vary tz so each call misses the report cache and pays the real cost.
            usage.report({ range: '30d' as never, includeAdmins: true, tzOffsetMinutes: rnd(55) })
          )
        }
      })()
    )
  const mem0 = process.memoryUsage().rss
  let peak = mem0
  const iv = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 200)
  await Promise.all(loops)
  clearInterval(iv)

  console.log('\nop                     n    err   ops/s     p50ms     p95ms     p99ms')
  for (const [name, s] of Object.entries(stats)) {
    const a = s.ms.sort((x, y) => x - y)
    console.log(
      `${name.padEnd(22)} ${String(a.length).padStart(6)} ${String(s.errors).padStart(5)} ${(a.length / seconds).toFixed(1).padStart(7)} ${pct(a, 0.5).toFixed(0).padStart(9)} ${pct(a, 0.95).toFixed(0).padStart(9)} ${pct(a, 0.99).toFixed(0).padStart(9)}`
    )
  }
  console.log(`\nRSS peak ${(peak / 1e6).toFixed(0)} MB (start ${(mem0 / 1e6).toFixed(0)} MB)`)
}

;(async () => {
  try {
    if (cmd === 'seed') await seed()
    else if (cmd === 'clean') await clean()
    else await run()
  } finally {
    await prisma.$disconnect()
  }
})()
