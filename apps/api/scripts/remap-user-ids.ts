/**
 * Re-map a user's Clerk userId across every table that stores it.
 *
 * Use case: switching from a dev Clerk instance to a production instance.
 * The userId you got in dev (`user_3DE90O6Xu4St6...`) is gone forever; your
 * production sign-up gets a fresh `user_xxx`. This script rewrites the
 * existing rows so your history doesn't get orphaned.
 *
 * Tables touched:
 *   - User (the row you're remapping FROM is deleted at the end)
 *   - Membership (with collision handling — if the prod user is already a
 *     member of the same (institution, cohort), the old Membership is dropped
 *     instead of duplicated)
 *   - SimulationResult, SimulationAttempt, ImmersiveSession (plain UPDATE)
 *
 * Tables NOT touched (no userId on them):
 *   - DimensionScore (linked via SimulationResult)
 *   - ImmersiveResponse (linked via ImmersiveSession)
 *
 * Usage:
 *   # Find the IDs first
 *   #   - Old: SELECT id, email FROM "User";   (or check Clerk dev dashboard)
 *   #   - New: sign up on prod, visit /dashboard (auto-syncs User mirror),
 *   #          then check Clerk prod dashboard → Users → your user
 *
 *   # Dry-run (default — shows what would change without writing)
 *   npm run remap:user -- --from user_DEV_xxx --to user_PROD_yyy
 *
 *   # Apply for real — wraps everything in a single transaction; all-or-nothing
 *   npm run remap:user -- --from user_DEV_xxx --to user_PROD_yyy --execute
 *
 * Requires the prod User row to already exist (sign in on prod once first;
 * useUserSync auto-creates it). The script aborts cleanly if either ID is
 * missing.
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

interface Args {
  from?: string
  to?: string
  execute: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { execute: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--from') args.from = argv[++i]
    else if (a === '--to') args.to = argv[++i]
    else if (a === '--execute') args.execute = true
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.from || !args.to) {
    console.error(
      'Usage: npm run remap:user -- --from <oldClerkId> --to <newClerkId> [--execute]\n' +
        'Default mode is dry-run; pass --execute to actually write.',
    )
    process.exit(1)
  }
  if (args.from === args.to) {
    console.error('--from and --to are the same. Nothing to do.')
    process.exit(1)
  }

  const prisma = new PrismaClient()

  try {
    // ── Pre-flight ─────────────────────────────────────────────────────────

    const [oldUser, newUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: args.from } }),
      prisma.user.findUnique({ where: { id: args.to } }),
    ])

    if (!oldUser) {
      console.error(`Old user "${args.from}" not found in the User table — nothing to remap.`)
      process.exit(1)
    }
    if (!newUser) {
      console.error(
        `New user "${args.to}" not found in the User table.\n` +
          `Sign in on the production site first (any signed-in page triggers /me/sync), ` +
          `which creates the User mirror row. Then re-run this script.`,
      )
      process.exit(1)
    }

    // ── Discover what would change ────────────────────────────────────────

    const [oldMemberships, results, attempts, sessions] = await Promise.all([
      prisma.membership.findMany({
        where: { userId: args.from },
        include: {
          institution: { select: { name: true } },
          cohort: { select: { name: true } },
        },
      }),
      prisma.simulationResult.count({ where: { userId: args.from } }),
      prisma.simulationAttempt.count({ where: { userId: args.from } }),
      prisma.immersiveSession.count({ where: { userId: args.from } }),
    ])

    // Check Membership collisions on the unique (userId, institutionId, cohortId).
    const newMemberships = await prisma.membership.findMany({
      where: { userId: args.to },
      select: { institutionId: true, cohortId: true },
    })
    const newKeys = new Set(newMemberships.map((m) => keyFor(m.institutionId, m.cohortId)))

    const collisions: typeof oldMemberships = []
    const moves: typeof oldMemberships = []
    for (const m of oldMemberships) {
      if (newKeys.has(keyFor(m.institutionId, m.cohortId))) collisions.push(m)
      else moves.push(m)
    }

    console.log(`\nRemapping ${args.from}  →  ${args.to}\n`)
    console.log(`  Old user:  ${oldUser.email ?? '(no email)'}  ${oldUser.displayName ?? ''}`)
    console.log(`  New user:  ${newUser.email ?? '(no email)'}  ${newUser.displayName ?? ''}\n`)
    console.log(`  Memberships: ${oldMemberships.length} total`)
    console.log(`    • will move: ${moves.length}`)
    for (const m of moves) console.log(`        - ${m.institution.name}${m.cohort ? ` / ${m.cohort.name}` : ''}`)
    console.log(`    • will drop (already a member on the new id): ${collisions.length}`)
    for (const m of collisions) console.log(`        - ${m.institution.name}${m.cohort ? ` / ${m.cohort.name}` : ''}`)
    console.log(`  SimulationResult rows: ${results}`)
    console.log(`  SimulationAttempt rows: ${attempts}`)
    console.log(`  ImmersiveSession rows: ${sessions}`)
    console.log(`  Old User row: will be DELETED at the end\n`)

    if (!args.execute) {
      console.log('Dry-run only. Re-run with --execute to apply.\n')
      return
    }

    // ── Execute (transaction = all or nothing) ────────────────────────────

    const summary = await prisma.$transaction(async (tx) => {
      // 1. Move Memberships that don't collide. Drop the rest.
      let moved = 0
      for (const m of moves) {
        await tx.membership.update({ where: { id: m.id }, data: { userId: args.to } })
        moved++
      }
      let dropped = 0
      for (const m of collisions) {
        await tx.membership.delete({ where: { id: m.id } })
        dropped++
      }

      // 2. Plain UPDATEs for the no-FK tables.
      const r = await tx.simulationResult.updateMany({
        where: { userId: args.from },
        data: { userId: args.to },
      })
      const a = await tx.simulationAttempt.updateMany({
        where: { userId: args.from },
        data: { userId: args.to },
      })
      const s = await tx.immersiveSession.updateMany({
        where: { userId: args.from },
        data: { userId: args.to },
      })

      // 3. Drop the old User row (any leftover Memberships would cascade-delete,
      //    but at this point there are none — moves moved them, drops dropped them).
      await tx.user.delete({ where: { id: args.from } })

      return { moved, dropped, results: r.count, attempts: a.count, sessions: s.count }
    })

    console.log('✓ Done.\n')
    console.log(`  Membership moved:   ${summary.moved}`)
    console.log(`  Membership dropped: ${summary.dropped}`)
    console.log(`  SimulationResult:   ${summary.results}`)
    console.log(`  SimulationAttempt:  ${summary.attempts}`)
    console.log(`  ImmersiveSession:   ${summary.sessions}`)
    console.log(`  Old User row:       deleted\n`)
  } finally {
    await prisma.$disconnect()
  }
}

function keyFor(institutionId: string, cohortId: string | null): string {
  return `${institutionId}::${cohortId ?? ''}`
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
