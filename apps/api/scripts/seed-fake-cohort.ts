/**
 * Demo data seed/cleanup for the institution + cohort analytics views.
 *
 * Creates a real institution + cohort, real Clerk users (with verified
 * emails so they can sign in), real Membership rows, and a spread of
 * SimulationResult / SimulationAttempt rows so the analytics page lights
 * up. The remove command nukes whatever institution name you pass —
 * including any real users in it — so use with care, especially in prod.
 *
 * NOTE: Clerk validates the email domain against real-world TLDs and
 * rejects reserved ones (.test, .local, .invalid). Use a real-looking
 * TLD like .com / .dev / .io even if the domain isn't registered —
 * Clerk doesn't verify deliverability on admin createUser, just format.
 *
 * Usage:
 *   # Add — creates institution "Demo U" with a 10-student cohort
 *   npm run seed:fake -- add \
 *     --institution "Demo U" \
 *     --domain demo-u.com \
 *     --cohort "Spring 2026" \
 *     --users 10 \
 *     --join-key spring2026-demo
 *
 *   # List — show all institutions and member counts
 *   npm run seed:fake -- list
 *
 *   # Remove — delete an institution and ALL its data (cohorts,
 *   # memberships, Clerk users, SimulationResult, SimulationAttempt)
 *   npm run seed:fake -- remove --institution "Demo U" --yes
 *
 * Defaults to the local Railway DB via DATABASE_URL in apps/api/.env.
 * Override CLERK_SECRET_KEY in your shell to seed against a different
 * Clerk instance.
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClerkClient, type ClerkClient } from '@clerk/backend'
import * as readline from 'readline'

// ── arg parsing ─────────────────────────────────────────────────────────────

interface Args {
  _: string[]
  flags: Record<string, string | boolean>
}

function parseArgs(argv: string[]): Args {
  const args: Args = { _: [], flags: {} }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        args.flags[key] = true
      } else {
        args.flags[key] = next
        i++
      }
    } else {
      args._.push(a)
    }
  }
  return args
}

function requireFlag(args: Args, name: string): string {
  const v = args.flags[name]
  if (typeof v !== 'string' || v.trim() === '') {
    console.error(`Missing required flag --${name}`)
    process.exit(1)
  }
  return v.trim()
}

function intFlag(args: Args, name: string, fallback: number): number {
  const v = args.flags[name]
  if (typeof v !== 'string') return fallback
  const n = parseInt(v, 10)
  if (Number.isNaN(n)) return fallback
  return n
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`${prompt} [y/N] `, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase().startsWith('y'))
    })
  })
}

// ── seed data templates ────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Alex', 'Sam', 'Taylor', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Cameron',
  'Jamie', 'Drew', 'Avery', 'Quinn', 'Reese', 'Skyler', 'Rowan', 'Harper',
  'Kai', 'Sage', 'River', 'Logan',
]
const LAST_NAMES = [
  'Patel', 'Nguyen', 'Garcia', 'Cohen', 'Singh', 'Kim', 'Okafor', 'Hassan',
  'Andersen', 'Murphy', 'Yamamoto', 'Reyes', 'Schmidt', 'O\'Brien', 'Park',
  'Williams', 'Rossi', 'Khan', 'Tremblay', 'Petrova',
]
// Pulled from track-meta.ts to keep the demo data realistic.
const TRACKS = ['operations', 'business', 'risk', 'customer-success', 'general']
const DIMENSIONS = [
  'Communication', 'Decision Making', 'Stakeholder Management',
  'Analytical Thinking', 'Risk Assessment',
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function pickN<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n)
}
function intBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function qualityFor(score: number): string {
  if (score >= 80) return 'strong'
  if (score >= 60) return 'proficient'
  return 'developing'
}

// ── add ─────────────────────────────────────────────────────────────────────

async function add(args: Args, prisma: PrismaClient, clerk: ClerkClient): Promise<void> {
  const institutionName = requireFlag(args, 'institution')
  const domain = requireFlag(args, 'domain').toLowerCase().replace(/^@/, '')
  const cohortName = requireFlag(args, 'cohort')
  const joinKey = (args.flags['join-key'] as string | undefined)?.trim() || null
  const numUsers = intFlag(args, 'users', 10)

  console.log(`\n→ Seeding institution "${institutionName}" with ${numUsers} users\n`)

  // Find or create institution.
  let institution = await prisma.institution.findFirst({ where: { name: institutionName } })
  if (institution) {
    console.log(`  • institution exists (id=${institution.id})`)
  } else {
    institution = await prisma.institution.create({
      data: { name: institutionName, emailDomain: domain },
    })
    console.log(`  • created institution (id=${institution.id}, domain=${domain})`)
  }

  // Find or create cohort.
  let cohort = await prisma.cohort.findFirst({
    where: { institutionId: institution.id, name: cohortName },
  })
  if (cohort) {
    console.log(`  • cohort exists (id=${cohort.id})`)
  } else {
    cohort = await prisma.cohort.create({
      data: { institutionId: institution.id, name: cohortName, joinKey },
    })
    console.log(`  • created cohort (id=${cohort.id}${joinKey ? `, joinKey=${joinKey}` : ''})`)
  }

  // Create users + memberships + simulations.
  let createdUsers = 0
  let createdResults = 0
  let createdAttempts = 0
  let skipped = 0

  for (let i = 0; i < numUsers; i++) {
    const first = pick(FIRST_NAMES)
    const last = pick(LAST_NAMES)
    const email = `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}.${i}@${domain}`

    // 1. Clerk user
    let clerkUserId: string
    try {
      const clerkUser = await clerk.users.createUser({
        firstName: first,
        lastName: last,
        emailAddress: [email],
        skipPasswordRequirement: true,
      })
      clerkUserId = clerkUser.id
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Clerk surfaces detailed reasons under .errors — log them so users can fix
      // whatever's blocking (often "email address can't be used" for reserved TLDs).
      const detail = (err as { errors?: Array<{ message?: string; longMessage?: string; code?: string }> }).errors
      if (msg.includes('already exists') || msg.includes('taken')) {
        const list = await clerk.users.getUserList({ emailAddress: [email] })
        if (list.data.length === 0) {
          console.warn(`  ! couldn't create or find ${email} — skipping`)
          skipped++
          continue
        }
        clerkUserId = list.data[0].id
        console.log(`  • clerk user already existed: ${email} (${clerkUserId})`)
      } else {
        const reasons = detail?.map((e) => `${e.code ?? '?'}: ${e.longMessage ?? e.message ?? ''}`).join('; ')
        console.warn(`  ! clerk createUser failed for ${email}: ${msg}${reasons ? ` — ${reasons}` : ''}`)
        skipped++
        continue
      }
    }

    // 2. User mirror
    await prisma.user.upsert({
      where: { id: clerkUserId },
      create: { id: clerkUserId, email, displayName: `${first} ${last}` },
      update: { email, displayName: `${first} ${last}` },
    })

    // 3. Membership (idempotent on unique [userId, institutionId, cohortId])
    try {
      await prisma.membership.create({
        data: { userId: clerkUserId, institutionId: institution.id, cohortId: cohort.id },
      })
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err
      // Already a member — fine.
    }

    // 4. Random SimulationAttempts (1–6) and SimulationResults (≤ attempts so completion rate < 100%)
    const attemptCount = intBetween(1, 6)
    const completionCount = intBetween(0, attemptCount)
    for (let a = 0; a < attemptCount; a++) {
      const track = pick(TRACKS)
      const daysAgo = intBetween(0, 60)
      const startedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
      await prisma.simulationAttempt.create({
        data: {
          userId: clerkUserId,
          scenarioId: `seed-${track}-${a}`,
          track,
          startedAt,
        },
      })
      createdAttempts++

      if (a < completionCount) {
        const overallScore = intBetween(40, 95)
        const dims = pickN(DIMENSIONS, intBetween(3, DIMENSIONS.length))
        await prisma.simulationResult.create({
          data: {
            id: `seed-result-${clerkUserId}-${a}-${Date.now()}-${Math.random()}`,
            userId: clerkUserId,
            scenarioId: `seed-${track}-${a}`,
            scenarioTitle: `Demo Scenario (${track})`,
            track,
            completedAt: new Date(startedAt.getTime() + intBetween(5, 30) * 60 * 1000),
            overallScore,
            choiceSequence: ['A', 'B', 'C'],
            dimensionScores: {
              create: dims.map((d) => {
                const score = clamp(intBetween(overallScore - 15, overallScore + 15), 0, 100)
                return {
                  dimension: d,
                  score,
                  quality: qualityFor(score),
                  feedback: `Seeded feedback for ${d}.`,
                }
              }),
            },
          },
        })
        createdResults++
      }
    }

    createdUsers++
    if ((i + 1) % 5 === 0) console.log(`  • ${i + 1}/${numUsers} users seeded`)
  }

  console.log(
    `\n✓ Done. ${createdUsers} users, ${createdAttempts} attempts, ${createdResults} completions, ${skipped} skipped.\n`,
  )
  console.log(`  View analytics: /admin/institutions/${institution.id}/analytics\n`)
}

// ── remove ──────────────────────────────────────────────────────────────────

async function remove(args: Args, prisma: PrismaClient, clerk: ClerkClient): Promise<void> {
  const institutionName = requireFlag(args, 'institution')
  const skipConfirm = args.flags['yes'] === true

  const institution = await prisma.institution.findFirst({ where: { name: institutionName } })
  if (!institution) {
    console.error(`No institution named "${institutionName}" found.`)
    process.exit(1)
  }

  const memberships = await prisma.membership.findMany({
    where: { institutionId: institution.id },
    select: { userId: true },
  })
  const userIds = [...new Set(memberships.map((m) => m.userId))]
  const cohortCount = await prisma.cohort.count({ where: { institutionId: institution.id } })

  console.log(`\nAbout to delete from institution "${institutionName}":`)
  console.log(`  • ${cohortCount} cohort(s)`)
  console.log(`  • ${memberships.length} membership(s) (${userIds.length} unique users)`)
  console.log(`  • all SimulationResult / SimulationAttempt rows for those users`)
  console.log(`  • the matching Clerk users\n`)
  console.log(`This is not reversible. Real users in this institution will be deleted too.\n`)

  if (!skipConfirm) {
    const ok = await confirm('Proceed?')
    if (!ok) {
      console.log('Aborted.')
      return
    }
  }

  // Delete simulation data (no FK from SimulationResult to User, so manual)
  if (userIds.length > 0) {
    const r = await prisma.simulationResult.deleteMany({ where: { userId: { in: userIds } } })
    const a = await prisma.simulationAttempt.deleteMany({ where: { userId: { in: userIds } } })
    console.log(`  • deleted ${r.count} SimulationResult, ${a.count} SimulationAttempt`)
  }

  // Delete Clerk users (best effort — failures are non-fatal)
  let clerkDeleted = 0
  let clerkFailed = 0
  for (const uid of userIds) {
    try {
      await clerk.users.deleteUser(uid)
      clerkDeleted++
    } catch (err) {
      // 404 — user already gone — fine
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('not_found') && !msg.includes('404')) {
        console.warn(`  ! failed to delete clerk user ${uid}: ${msg}`)
        clerkFailed++
      }
    }
  }
  console.log(`  • deleted ${clerkDeleted} Clerk users (${clerkFailed} failed)`)

  // Delete institution — cascades to Cohort + Membership + (User via Membership.userId? no, Membership FK to User only cascades on User delete)
  // We need to also delete the User mirror rows.
  if (userIds.length > 0) {
    const u = await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    console.log(`  • deleted ${u.count} User mirror rows (cascades through Memberships)`)
  }
  await prisma.institution.delete({ where: { id: institution.id } })
  console.log(`  • deleted institution\n`)

  console.log('✓ Done.\n')
}

// ── list ────────────────────────────────────────────────────────────────────

async function list(prisma: PrismaClient): Promise<void> {
  const institutions = await prisma.institution.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { memberships: true, cohorts: true } },
    },
  })
  if (institutions.length === 0) {
    console.log('No institutions.')
    return
  }
  console.log('\nInstitutions:')
  for (const inst of institutions) {
    console.log(
      `  • ${inst.name}  (domain=${inst.emailDomain ?? 'none'}, ` +
        `${inst._count.cohorts} cohort(s), ${inst._count.memberships} member(s))`,
    )
  }
  console.log()
}

// ── helpers ─────────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const subcommand = args._[0]

  const prisma = new PrismaClient()
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) {
    console.error('CLERK_SECRET_KEY not set. Add it to apps/api/.env.')
    process.exit(1)
  }
  const clerk = createClerkClient({ secretKey })

  try {
    switch (subcommand) {
      case 'add':
        await add(args, prisma, clerk)
        break
      case 'remove':
        await remove(args, prisma, clerk)
        break
      case 'list':
        await list(prisma)
        break
      default:
        console.log(`Usage:
  npm run seed:fake -- add --institution NAME --domain DOMAIN --cohort NAME [--users N] [--join-key KEY]
  npm run seed:fake -- remove --institution NAME [--yes]
  npm run seed:fake -- list
`)
        process.exit(subcommand ? 1 : 0)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
