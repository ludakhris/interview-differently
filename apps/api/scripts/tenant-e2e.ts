/**
 * End-to-end check of tenant isolation (GitHub issue #84) against a development database. Boots the real API
 * with its real guards, controllers and Prisma proxy, replaces only Clerk (so no sign-in is needed), and
 * sweeps the Learn Differently routes as several people. Run it twice and compare:
 *
 *   plain  (the API connects as the owner, so no row-level security)   ts-node scripts/tenant-e2e.ts --mode plain --out plain.json
 *   rls    (the API connects as the restricted role)   ts-node scripts/tenant-e2e.ts --mode rls --out rls.json
 *   compare                                              ts-node scripts/tenant-e2e.ts --compare plain.json rls.json
 *
 * Someone who may see everything must get the same answers either way; someone confined to one agency must
 * be refused or shown nothing from another. It creates a few `e2e-*` users, some with a role at a workspace, in the database
 * it points at, and replaces sign-in with a header anyone can send. NEVER run it against production: both
 * DATABASE_URL and SCHEMA_DATABASE_URL must be the development database, and --confirm-host must name it.
 */
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { NestFactory } from '@nestjs/core'
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '../src/prisma/client'
import { requireHostConfirmation } from './lib/db-guard'
import { STANDALONE_AGENCY_ID } from '../src/core/standalone-agency'

const args = process.argv.slice(2)
const flag = (n: string) => args[args.indexOf(`--${n}`) + 1]

type Who = { id: string; role?: string; source: 'learn' | 'interview' }
const WHO: Record<string, Who> = {
  system: { id: 'e2e-system', role: 'system-admin', source: 'learn' },
  agencyDE: { id: 'e2e-agency-de', role: 'agency-admin', source: 'learn' },
  agencyCH: { id: 'e2e-agency-ch', role: 'agency-admin', source: 'learn' },
  agencyNone: { id: 'e2e-agency-none', role: 'agency-admin', source: 'learn' },
  providerDE: { id: 'e2e-provider-de', role: 'provider-admin', source: 'learn' },
  learner: { id: 'REAL_LEARNER', source: 'learn' },
  idAdmin: { id: 'e2e-id-admin', role: 'admin', source: 'interview' },
  idLearner: { id: 'e2e-id-learner', source: 'interview' },
}

/** Test people and their grants, made with the owner connection. */
async function setup(owner: PrismaClient): Promise<{ learnerId: string; chCohorts: string[] }> {
  const users = Object.values(WHO).filter((w) => w.id.startsWith('e2e-'))
  for (const u of users) {
    await owner.user.upsert({
      where: { id: u.id },
      update: {},
      create: { id: u.id, source: u.source, email: `${u.id}@example.test`, displayName: u.id },
    })
  }
  const inst = async (sub: string) =>
    (await owner.institution.findFirstOrThrow({ where: { subdomain: sub } })).id
  const de = await inst('delaware')
  const ch = await inst('chesapeake')
  const provider = await owner.institution.findFirstOrThrow({
    where: { parentId: de, kind: 'provider' },
  })
  const grant = async (userId: string, institutionId: string, role: string) => {
    const where = { userId, institutionId, cohortId: null }
    const have = await owner.membership.findFirst({ where })
    if (!have) await owner.membership.create({ data: { ...where, role } })
    else if (have.role !== role)
      await owner.membership.update({ where: { id: have.id }, data: { role } })
  }
  await grant(WHO.agencyDE.id, de, 'agency-admin')
  await grant(WHO.agencyCH.id, ch, 'agency-admin')
  await grant(WHO.providerDE.id, provider.id, 'provider-admin')
  const learner = await owner.enrollment.findFirstOrThrow({
    where: {
      user: { source: 'learn', id: { not: { startsWith: 'e2e-' } } },
      cohort: { courseId: { not: null } },
    },
    select: { userId: true },
  })
  const chCohorts = (
    await owner.cohort.findMany({ where: { agencyId: ch }, select: { id: true }, take: 3 })
  ).map((c) => c.id)
  return { learnerId: learner.userId, chCohorts }
}

async function main(): Promise<void> {
  if (args.includes('--compare'))
    return compare(args[args.indexOf('--compare') + 1], args[args.indexOf('--compare') + 2])
  requireHostConfirmation()
  const mode = flag('mode')
  const out = flag('out')
  if (!mode || !out) throw new Error('Pass --mode plain|rls and --out <file>')
  // DATABASE_URL is the API's connection: the owner for a plain run, the restricted role for an RLS run.
  const ownerUrl = process.env.SCHEMA_DATABASE_URL
  if (!ownerUrl)
    throw new Error(
      'Set SCHEMA_DATABASE_URL (the owner) as well as DATABASE_URL (the restricted role)'
    )
  // Both connections must be the database that was confirmed: this script writes through the owner one.
  if (new URL(ownerUrl).host !== new URL(process.env.DATABASE_URL as string).host) {
    throw new Error('DATABASE_URL and SCHEMA_DATABASE_URL point at different hosts. Stopping.')
  }
  if (mode === 'plain') process.env.DATABASE_URL = ownerUrl
  const owner = new PrismaClient({
    adapter: prismaAdapter(process.env.SCHEMA_DATABASE_URL ?? process.env.DATABASE_URL),
  })
  const { learnerId, chCohorts } = await setup(owner)
  await owner.institution.deleteMany({
    where: { name: 'E2E Standalone College', parentId: STANDALONE_AGENCY_ID },
  })
  WHO.learner.id = learnerId

  // The real app, with Clerk swapped for a lookup of "Bearer t:<user id>".
  const { AppModule } = await import('../src/app.module')
  const { ClerkService } = await import('../src/auth/clerk.service')
  const app = await NestFactory.create(AppModule, { logger: false })
  app.setGlobalPrefix('api')
  const clerk = app.get(ClerkService)
  const byId = new Map(Object.values(WHO).map((w) => [w.id, w]))
  const idOf = async (t: string) => (t.startsWith('t:') && byId.has(t.slice(2)) ? t.slice(2) : null)
  clerk.verifyBearerToken = idOf
  clerk.verifyLearnToken = idOf
  clerk.getRole = async (id: string) => byId.get(id)?.role ?? null
  clerk.getUserProfile = async () => null
  await app.listen(0)
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`

  const results: Record<string, unknown>[] = []
  const call = async (who: string, path: string) => {
    const started = Date.now()
    const res = await fetch(base + path, {
      headers: { authorization: `Bearer t:${WHO[who].id}` },
      signal: AbortSignal.timeout(60_000),
    })
    const text = await res.text()
    const ms = Date.now() - started
    let shape = ''
    try {
      const j = JSON.parse(text)
      shape = Array.isArray(j)
        ? `array(${j.length})`
        : j && typeof j === 'object'
          ? `object(${Object.keys(j).length})`
          : typeof j
    } catch {
      shape = `text(${text.length})`
    }
    const rec = {
      who,
      path,
      status: res.status,
      shape,
      hash: createHash('sha1')
        .update(text.replace(/"\d{4}-\d{2}-\d{2}T[\d:.]+Z"/g, '"T"'))
        .digest('hex')
        .slice(0, 10),
      ms,
    }
    results.push(rec)
    return {
      status: res.status,
      json: (() => {
        try {
          return JSON.parse(text)
        } catch {
          return null
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- walks whatever JSON each endpoint returns
      })() as any,
    }
  }

  const sweep = async (who: string) => {
    const ws = (await call(who, '/api/learn/workspaces')).json
    await call(who, '/api/learn/workspaces/summary')
    await call(who, '/api/learn/me/attention')
    const learning = (await call(who, '/api/learn/me/learning')).json
    // What a learner opens: their cohort's course outline and one of its items.
    for (const card of Array.isArray(learning) ? learning.slice(0, 2) : []) {
      const outline = (await call(who, `/api/learn/me/cohorts/${card.cohortId}`)).json
      const item = outline?.modules?.[0]?.items?.[0]
      if (item) await call(who, `/api/learn/me/cohorts/${card.cohortId}/items/${item.id}`)
    }
    await call(who, '/api/learn/me/profile')
    await call(who, '/api/learn/me/join-requests')
    for (const w of Array.isArray(ws) ? ws.slice(0, 3) : []) {
      const sub = w.subdomain
      const cohorts = (await call(who, `/api/learn/workspaces/${sub}/cohorts`)).json
      const courses = (await call(who, `/api/learn/workspaces/${sub}/courses`)).json
      await call(who, `/api/learn/workspaces/${sub}/runnable-courses`)
      await call(who, `/api/learn/agency/outcomes?tenant=${sub}`)
      await call(who, `/api/learn/agency/exit-file.csv?tenant=${sub}`)
      for (const c of Array.isArray(cohorts) ? cohorts.slice(0, 2) : []) {
        for (const p of [
          '',
          '/join-requests',
          '/assessments',
          '/monitor/assessments',
          '/monitor/sql',
        ])
          await call(who, `/api/learn/cohorts/${c.id}${p}`)
        for (const p of ['sessions', 'attendance', 'activity'])
          await call(who, `/api/learn/cohorts/${c.id}/${p}`)
        await call(who, `/api/learn/agency/cohorts/${c.id}/gradebook?tenant=${sub}`)
        const detail = (await call(who, `/api/learn/cohorts/${c.id}`)).json
        const first = detail?.roster?.[0]
        if (first) {
          await call(who, `/api/learn/cohorts/${c.id}/learners/${first.userId}/record`)
          await call(who, `/api/learn/cohorts/${c.id}/activity/learners/${first.userId}`)
          await call(who, `/api/learn/enrollments/${first.enrollmentId}/attempts`)
        }
        await call(who, `/api/learn/me/cohorts/${c.id}`)
      }
      for (const co of Array.isArray(courses) ? courses.slice(0, 1) : []) {
        await call(who, `/api/learn/courses/${co.id}`)
        await call(who, `/api/learn/courses/${co.id}/offers`)
      }
      if (w.kind !== 'agency') {
        await call(who, `/api/learn/providers/${w.id}/participants`)
        await call(who, `/api/learn/providers/${w.id}/support-items`)
        await call(who, `/api/learn/providers/${w.id}/staff-members`)
        await call(who, `/api/learn/data-access-log?providerId=${w.id}`)
      }
    }
  }
  for (const who of ['system', 'agencyDE', 'agencyCH', 'agencyNone', 'providerDE', 'learner'])
    await sweep(who)

  // Reaching across: agencyDE (Delaware only) asks for Chesapeake things. Must never be a 200 with data.
  for (const c of chCohorts) {
    for (const p of ['', '/assessments', '/monitor/assessments'])
      await call('agencyDE', `/api/learn/cohorts/${c}${p}`)
    await call('agencyDE', `/api/learn/cohorts/${c}/attendance`)
    await call('agencyDE', `/api/learn/agency/cohorts/${c}/gradebook?tenant=chesapeake`)
    await call('providerDE', `/api/learn/cohorts/${c}`)
    await call('learner', `/api/learn/cohorts/${c}`)
  }
  await call('agencyDE', '/api/learn/agency/outcomes?tenant=chesapeake')
  await call('agencyDE', '/api/learn/workspaces/chesapeake/cohorts')
  await call('agencyDE', '/api/learn/workspaces/chesapeake/courses')

  // The public catalog: no sign-in, and it must keep working while courses are private.
  const catalog = (await call('learner', '/api/learn/public/delaware/catalog')).json
  for (const c of Array.isArray(catalog) ? catalog.slice(0, 2) : [])
    await call('learner', `/api/learn/public/delaware/courses/${c.id}`)

  // Interview Differently (standalone): an admin sets up a school and a cohort, a learner joins it by code.
  for (const p of [
    '/api/admin/institutions',
    '/api/admin/assessments',
    '/api/admin/datasets',
    '/api/admin/usage',
  ])
    await call('idAdmin', p)
  const post = async (who: string, path: string, body: unknown) => {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { authorization: `Bearer t:${WHO[who].id}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    results.push({
      who,
      path: `POST ${path}`,
      status: res.status,
      shape: text.length ? 'body' : 'empty',
      hash: '-',
    })
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }
  const school = await post('idAdmin', '/api/admin/institutions', {
    name: 'E2E Standalone College',
  })
  const cohort =
    school &&
    (await post('idAdmin', `/api/admin/institutions/${school.id}/cohorts`, {
      name: 'E2E Cohort',
      joinKey: 'e2e-standalone-key',
    }))
  if (school && cohort) {
    await post('idLearner', '/api/me/memberships', { joinKey: 'e2e-standalone-key' })
    await call('idLearner', '/api/me/memberships')
    await call('idAdmin', `/api/admin/institutions/${school.id}`)
    await call('idAdmin', `/api/admin/institutions/${school.id}/cohorts`)
    await call('idAdmin', `/api/admin/cohorts/${cohort.id}/members`)
    const agency = await owner.institution.findUnique({
      where: { id: school.id },
      select: { parentId: true },
    })
    const row = await owner.cohort.findUnique({
      where: { id: cohort.id },
      select: { agencyId: true },
    })
    results.push({
      who: 'check',
      path: `school agency=${agency?.parentId} cohort agency=${row?.agencyId}`,
      status: agency?.parentId === row?.agencyId && !!row?.agencyId ? 200 : 500,
      shape: 'agency',
      hash: '-',
    })
    await owner.institution.deleteMany({ where: { id: school.id } })
  }
  await owner.$disconnect()

  writeFileSync(out, JSON.stringify({ mode, results }, null, 1))
  const n = (s: number) => results.filter((r) => r.status === s).length
  console.log(
    `${mode}: ${results.length} requests, ${n(200)} ok, ${n(403)} forbidden, ${n(404)} not found, ${results.filter((r) => (r.status as number) >= 500).length} errors`
  )
  await app.close()
}

function compare(plainFile: string, rlsFile: string): void {
  const plain = JSON.parse(readFileSync(plainFile, 'utf8')).results as {
    who: string
    path: string
    status: number
    shape: string
    hash: string
  }[]
  const rls = JSON.parse(readFileSync(rlsFile, 'utf8')).results as typeof plain
  let same = 0
  const diffs: string[] = []
  plain.forEach((p, i) => {
    const r = rls[i]
    if (r && r.path === p.path && r.who === p.who && r.status === p.status && r.shape === p.shape)
      same++
    else
      diffs.push(
        `${p.who.padEnd(10)} ${p.path}\n    plain: ${p.status} ${p.shape}\n    rls:   ${r?.status} ${r?.shape}`
      )
  })
  console.log(`${same} of ${plain.length} requests answer the same with row-level security on.`)
  if (diffs.length) console.log(`\nDifferent:\n${diffs.join('\n')}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
