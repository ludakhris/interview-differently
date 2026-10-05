/**
 * LearnDifferently demo data (#46, #49): a fictional Delaware tenant with five
 * training providers, a member institution, cohorts of ~24 learners, pre/post
 * scores, lesson progress, interview scores and completions.
 *
 * Everything is fictional sample data: no real people, providers or outcomes.
 * Every row it creates has an id starting with "demo-", so the script can
 * reload or remove exactly its own data and nothing else. Output is
 * deterministic (seeded RNG), so reruns and screenshots match.
 *
 * Usage (from apps/api):
 *   npm run seed:learn-demo              # reload: remove old demo rows, insert fresh
 *   npm run seed:learn-demo -- --remove  # remove demo rows only
 *   npm run seed:learn-demo -- --allow-host <host>   # run against a non-dev database
 *
 * Refuses to run unless DATABASE_URL points at localhost or the Railway dev
 * database. Never pass --allow-host for production without the owner's OK.
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const DEV_HOSTS = ['localhost', '127.0.0.1', 'zephyr.proxy.rlwy.net']
const TODAY = new Date('2026-10-04T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY

// ── deterministic randomness ────────────────────────────────────────────────

function hash(s: string): number {
  let h = 1779033703 ^ s.length
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

function rng(seed: string) {
  let a = hash(seed)
  const next = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const normal = (mean: number, sd: number) => {
    const u = Math.max(next(), 1e-9)
    const v = next()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  return { next, normal }
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)))

// ── fictional content ───────────────────────────────────────────────────────

const FIRST = [
  'Aaliyah', 'Marcus', 'Elena', 'Tyrell', 'Priya', 'Jordan', 'Sofia', 'Devon', 'Mei', 'Carlos',
  'Naomi', 'Andre', 'Hannah', 'Luis', 'Imani', 'Owen', 'Fatima', 'Caleb', 'Rosa', 'Dante',
  'Grace', 'Malik', 'Ava', 'Jamal', 'Lucia', 'Terrence', 'Nia', 'Gabriel', 'Keisha', 'Ethan',
  'Amara', 'Victor', 'Daniela', 'Isaiah', 'Maya', 'Hector', 'Brianna', 'Samuel', 'Tasha', 'Noah',
]
const LAST = [
  'Alvarez', 'Bennett', 'Carter', 'Dawson', 'Ellis', 'Foster', 'Garrett', 'Hughes', 'Ibarra', 'Jennings',
  'Kowalski', 'Lawson', 'Mitchell', 'Nguyen', 'Okafor', 'Pruitt', 'Quinn', 'Rivera', 'Stokes', 'Turner',
  'Underwood', 'Vance', 'Whitaker', 'Young', 'Zimmerman', 'Banks', 'Coleman', 'Dunn', 'Ferrell', 'Greer',
  'Holloway', 'Jacobs', 'Kemp', 'Lowry', 'Monroe', 'Nash', 'Osborne', 'Patel', 'Reyes', 'Sutton',
]

interface Profile {
  key: string
  provider: string
  subdomain: string
  program: string
  slug: string
  sector: string
  credential: string
  lengthWeeks: number
  pre: number // mean pre-assessment score
  gain: number // mean pre→post gain, points
  completion: number // share of enrollees who finish
  interview: number // mean best interview score
  lessons: string[]
  scenarioId: string
}

const PROFILES: Profile[] = [
  {
    key: 'harbor-point', provider: 'Harbor Point Health Careers', subdomain: 'harborpoint',
    program: 'Medical Assistant', slug: 'medical-assistant', sector: 'Healthcare', credential: 'CCMA',
    lengthWeeks: 16, pre: 54, gain: 30, completion: 0.92, interview: 79,
    lessons: ['Clinical safety and infection control', 'Taking vital signs', 'Patient intake and charting', 'Medical terminology', 'Scheduling and communication'],
    scenarioId: 'medical-assistant-intake',
  },
  {
    key: 'tidewater', provider: 'Tidewater Care Training Center', subdomain: 'tidewater',
    program: 'Certified Nursing Assistant', slug: 'certified-nursing-assistant', sector: 'Healthcare', credential: 'CNA',
    lengthWeeks: 6, pre: 58, gain: 24, completion: 0.88, interview: 74,
    lessons: ['Resident rights and dignity', 'Mobility and transfers', 'Personal care basics', 'Infection prevention', 'Documenting care'],
    scenarioId: 'cna-shift-interview',
  },
  {
    key: 'lantern-hill', provider: 'Lantern Hill Tech Academy', subdomain: 'lanternhill',
    program: 'IT Support Specialist', slug: 'it-support-specialist', sector: 'Technology', credential: 'CompTIA A+',
    lengthWeeks: 12, pre: 47, gain: 33, completion: 0.79, interview: 71,
    lessons: ['Hardware fundamentals', 'Operating systems', 'Networking basics', 'Troubleshooting method', 'Customer-facing support'],
    scenarioId: 'it-support-interview',
  },
  {
    key: 'cedar-mill', provider: 'Cedar Mill Trades Institute', subdomain: 'cedarmill',
    program: 'Electrical Pre-Apprenticeship', slug: 'electrical-pre-apprenticeship', sector: 'Construction', credential: 'OSHA 10',
    lengthWeeks: 10, pre: 51, gain: 27, completion: 0.84, interview: 72,
    lessons: ['Jobsite safety', 'Electrical theory', 'Reading blueprints', 'Hand and power tools', 'Working on a crew'],
    scenarioId: 'electrician-apprentice-interview',
  },
  {
    key: 'open-road', provider: 'Open Road Driver School', subdomain: 'openroad',
    program: 'Commercial Driver Training', slug: 'commercial-driver-training', sector: 'Transportation', credential: 'CDL Class A',
    lengthWeeks: 4, pre: 62, gain: 18, completion: 0.9, interview: 67,
    lessons: ['Federal regulations', 'Pre-trip inspection', 'Vehicle control', 'Hours of service', 'Route planning'],
    scenarioId: 'cdl-driver-interview',
  },
]

// Three cohorts per provider: two finished, one running now.
// startOffsetWeeks is measured back from TODAY.
const COHORT_PLAN = [
  { label: 'A', startOffsetWeeks: 40, trend: 0 },
  { label: 'B', startOffsetWeeks: 22, trend: 2 },
  { label: 'C', startOffsetWeeks: 5, trend: 4 },
]

const AGENCY_ID = 'demo-inst-delaware-dol'
const MEMBER_ID = 'demo-inst-wilmington-workforce'

// ── arg + safety checks ─────────────────────────────────────────────────────

function dbHost(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return new URL(url).hostname
}

function guard(allowHost: string | undefined): string {
  const host = dbHost()
  if (DEV_HOSTS.includes(host) || host === allowHost) return host
  console.error(
    `Refusing to run: DATABASE_URL host is "${host}", not localhost or the dev database.\n` +
      `Pass --allow-host ${host} only with the owner's OK.`
  )
  process.exit(1)
}

// ── remove ──────────────────────────────────────────────────────────────────

async function removeDemo(prisma: PrismaClient) {
  // Institution deletes cascade to cohorts, courses, enrollments and progress.
  const inst = await prisma.institution.deleteMany({ where: { id: { startsWith: 'demo-' } } })
  const users = await prisma.user.deleteMany({ where: { id: { startsWith: 'demo-learner-' } } })
  console.log(`Removed ${inst.count} institutions and ${users.count} demo learners (with their data).`)
}

// ── load ────────────────────────────────────────────────────────────────────

interface Learner {
  id: string
  name: string
}

function makeLearners(profile: Profile, cohortLabel: string, count: number, offset: number): Learner[] {
  const r = rng(`names-${profile.key}-${cohortLabel}`)
  const out: Learner[] = []
  const used = new Set<string>()
  while (out.length < count) {
    const name = `${FIRST[Math.floor(r.next() * FIRST.length)]} ${LAST[Math.floor(r.next() * LAST.length)]}`
    if (used.has(name)) continue
    used.add(name)
    out.push({ id: `demo-learner-${profile.key}-${cohortLabel.toLowerCase()}-${offset + out.length + 1}`, name })
  }
  return out
}

async function load(prisma: PrismaClient) {
  const brand = {
    primary: '#05405c',
    accent: '#d76f0f',
    sky: '#daf2fd',
    logoUrl: '/tenants/delaware/dol-logo.png',
    name: 'Delaware Department of Labor',
  }
  await prisma.institution.create({
    data: { id: AGENCY_ID, name: 'Delaware Department of Labor (demonstration)', kind: 'agency', subdomain: 'delaware', brand },
  })
  await prisma.institution.create({
    data: {
      id: MEMBER_ID, name: 'Wilmington Community Workforce Center', kind: 'member',
      parentId: AGENCY_ID, subdomain: 'wilmington',
    },
  })

  const learnerRows = new Map<string, string>() // id -> displayName
  const counts = { courses: 0, cohorts: 0, enrollments: 0, progress: 0 }

  for (const p of PROFILES) {
    const providerId = `demo-inst-${p.key}`
    await prisma.institution.create({
      data: { id: providerId, name: p.provider, kind: 'provider', parentId: AGENCY_ID, subdomain: p.subdomain },
    })

    // Course: pre-assessment, five lessons with knowledge checks, interview, post-assessment.
    const courseId = `demo-course-${p.key}`
    await prisma.course.create({
      data: {
        id: courseId, providerId, slug: p.slug, title: p.program, sector: p.sector,
        credential: p.credential, lengthWeeks: p.lengthWeeks,
        summary: `${p.program} offered by ${p.provider}. Sample content.`,
      },
    })
    const items: { id: string; type: string; label: string | null }[] = []
    const modules = [
      { title: 'Start here', items: [{ type: 'assessment', title: 'Pre-assessment', label: 'pre', config: { assessmentSlug: `${p.slug}-pre` } }] },
      {
        title: 'Core skills',
        items: p.lessons.flatMap((title, i) => [
          { type: 'lesson', title, label: null, config: { body: `Sample lesson ${i + 1}: ${title}.` } },
          ...(i % 2 === 1 ? [{ type: 'knowledge_check', title: `Check: ${title}`, label: null, config: {} }] : []),
        ]),
      },
      { title: 'Interview practice', items: [{ type: 'interview', title: `Practice interview: ${p.program}`, label: null, config: { scenarioId: p.scenarioId } }] },
      { title: 'Finish', items: [{ type: 'assessment', title: 'Post-assessment', label: 'post', config: { assessmentSlug: `${p.slug}-post` } }] },
    ]
    for (const [mi, m] of modules.entries()) {
      const moduleId = `demo-module-${p.key}-${mi + 1}`
      await prisma.courseModule.create({ data: { id: moduleId, courseId, title: m.title, position: mi + 1 } })
      await prisma.courseItem.createMany({
        data: m.items.map((it, ii) => {
          const id = `demo-item-${p.key}-${mi + 1}-${ii + 1}`
          items.push({ id, type: it.type, label: it.label })
          return { id, moduleId, type: it.type, title: it.title, position: ii + 1, label: it.label, config: it.config }
        }),
      })
    }
    counts.courses++

    // Providers offer their course to the member institution (Harbor Point's
    // medical assistant course also runs there).
    if (p.key === 'harbor-point' || p.key === 'tidewater') {
      await prisma.courseOffer.create({ data: { courseId, institutionId: MEMBER_ID } })
    }

    for (const plan of COHORT_PLAN) {
      const startsAt = new Date(TODAY.getTime() - plan.startOffsetWeeks * WEEK)
      const endsAt = new Date(startsAt.getTime() + p.lengthWeeks * WEEK)
      const finished = endsAt.getTime() <= TODAY.getTime()
      // Cohort C runs at the member institution for the two offered courses.
      const hostId = plan.label === 'C' && (p.key === 'harbor-point' || p.key === 'tidewater') ? MEMBER_ID : providerId
      const cohortId = `demo-cohort-${p.key}-${plan.label.toLowerCase()}`
      const r = rng(`cohort-${p.key}-${plan.label}`)
      const size = clamp(r.normal(24, 2), 20, 28)
      await prisma.cohort.create({
        data: {
          id: cohortId, institutionId: hostId, courseId,
          name: `${p.program} ${startsAt.getUTCFullYear()}-${plan.label}`,
          joinKey: `de-${p.key}-${plan.label.toLowerCase()}`,
          startsAt, endsAt,
        },
      })
      counts.cohorts++

      const learners = makeLearners(p, plan.label, size, 0)
      // A few learners from the first cohort enrol again later, in another
      // institution's cohort: one learner, several institutions.
      if (plan.label === 'C' && p.key === 'tidewater') {
        const prior = makeLearners(PROFILES[0], 'B', 24, 0).slice(0, 4)
        learners.splice(0, prior.length, ...prior)
      }

      const memberships: { userId: string; institutionId: string; cohortId: string }[] = []
      const enrollments: {
        id: string; cohortId: string; userId: string; status: string; enrolledAt: Date; completedAt: Date | null
      }[] = []
      const progress: {
        id: string; enrollmentId: string; itemId: string; status: string; score: number | null
        attempts: number; completedAt: Date | null
      }[] = []

      // Share of the course a still-running cohort has covered.
      const elapsed = finished ? 1 : Math.min(1, (TODAY.getTime() - startsAt.getTime()) / (p.lengthWeeks * WEEK))

      for (const [li, learner] of learners.entries()) {
        learnerRows.set(learner.id, learner.name)
        const lr = rng(`${cohortId}-${learner.id}`)
        const enrollmentId = `demo-enr-${cohortId}-${li + 1}`
        const featured = p.key === 'harbor-point' && plan.label === 'A' && li === 0
        const finishes = featured || lr.next() < p.completion
        const ability = lr.normal(0, 8)
        const pre = featured ? 54 : clamp(p.pre + ability + lr.normal(0, 6))
        const post = featured ? 88 : clamp(pre + p.gain + plan.trend + lr.normal(0, 7))
        const interviewBest = featured ? 86 : clamp(p.interview + plan.trend + ability * 0.6 + lr.normal(0, 8))
        const interviewAttempts = featured ? 3 : 1 + Math.floor(lr.next() * 3)

        // How far this learner got, as a fraction of the item list.
        let reach = 1
        if (!finishes) reach = Math.max(0.15, Math.min(0.85, lr.normal(0.5, 0.2)))
        if (!finished) reach = Math.min(reach, elapsed + lr.normal(0, 0.06))
        const withdrawn = finished ? !finishes : !finishes && lr.next() < 0.5

        const enrolledAt = new Date(startsAt.getTime() - Math.floor(lr.next() * 5) * DAY)
        const itemCount = items.length
        const doneCount = Math.floor(reach * itemCount)
        let lastDone: Date | null = null

        items.forEach((item, idx) => {
          const done = idx < doneCount
          const inProgress = !done && idx === doneCount && !withdrawn && !finished
          if (!done && !inProgress) return
          let score: number | null = null
          let attempts = 1
          if (item.label === 'pre') score = pre
          else if (item.label === 'post') score = post
          else if (item.type === 'interview') {
            score = interviewBest
            attempts = interviewAttempts
          } else if (item.type === 'knowledge_check') score = clamp(lr.normal(78 + plan.trend, 12))
          const when = new Date(
            startsAt.getTime() + ((idx + 1) / itemCount) * Math.min(elapsed, 1) * p.lengthWeeks * WEEK * 0.97
          )
          if (done) lastDone = when
          progress.push({
            id: `demo-prog-${enrollmentId}-${idx + 1}`,
            enrollmentId, itemId: item.id,
            status: done ? 'completed' : 'in_progress',
            score: done ? score : null,
            attempts: done ? attempts : 0,
            completedAt: done ? when : null,
          })
        })

        const completed = finishes && finished
        enrollments.push({
          id: enrollmentId, cohortId, userId: learner.id,
          status: completed ? 'completed' : withdrawn ? 'withdrawn' : 'enrolled',
          enrolledAt, completedAt: completed ? lastDone : null,
        })
        memberships.push({ userId: learner.id, institutionId: hostId, cohortId })
      }

      await prisma.user.createMany({
        data: learners.map((l) => ({ id: l.id, displayName: l.name })),
        skipDuplicates: true,
      })
      await prisma.membership.createMany({ data: memberships })
      await prisma.enrollment.createMany({ data: enrollments })
      await prisma.itemProgress.createMany({ data: progress })
      counts.enrollments += enrollments.length
      counts.progress += progress.length
    }
  }

  console.log(
    `Loaded demo tenant: ${counts.courses} courses, ${counts.cohorts} cohorts, ` +
      `${counts.enrollments} enrollments, ${counts.progress} progress rows, ${learnerRows.size} learners.`
  )
}

async function main() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--allow-host')
  const host = guard(i >= 0 ? argv[i + 1] : undefined)
  console.log(`Database host: ${host}`)
  const prisma = new PrismaClient()
  try {
    await removeDemo(prisma)
    if (!argv.includes('--remove')) await load(prisma)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
