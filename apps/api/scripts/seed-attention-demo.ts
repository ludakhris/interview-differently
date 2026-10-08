/**
 * Adds a few waiting items to the DEV database so the "Needs your attention" bell has something to
 * show for one person: two people waiting to join a Cedar Mill cohort, a support follow-up assigned to
 * them that is overdue, and an LTI platform waiting for approval. All rows are fictional and carry a
 * `demo-attn-` id so `--remove` takes exactly them away. Safe to run again.
 *
 * Usage (from apps/api):
 *   npm run seed:attention-demo -- --email you@example.com            # add the items
 *   npm run seed:attention-demo -- --email you@example.com --remove   # remove them
 *
 * The person must have signed in to LearnDifferently once (a `learn` account) and be a system admin
 * (so every workspace is open to them). Refuses to run unless DATABASE_URL points at localhost or the
 * Railway dev database. Run the demo seed first (npm run seed:learn-demo) so the cohort and learners exist.
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const DEV_HOSTS = ['localhost', '127.0.0.1', 'zephyr.proxy.rlwy.net']
const COHORT = 'demo-cohort-cedar-mill-c'
const PROVIDER = 'demo-inst-cedar-mill'
const REQUESTERS = ['demo-learner-cedar-mill-a-2', 'demo-learner-cedar-mill-a-3']
const SUPPORT_ABOUT = 'demo-learner-cedar-mill-c-2'
const SUPPORT_ID = 'demo-attn-support'
const PLATFORM_ID = 'demo-attn-platform'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const host = new URL(url).hostname
  if (!DEV_HOSTS.includes(host))
    throw new Error(`DATABASE_URL points at ${host}, not a development database.`)
  const email = arg('--email')
  if (!email) throw new Error('Pass --email <the address you sign in with>')
  const remove = process.argv.includes('--remove')
  const prisma = new PrismaClient()
  try {
    console.log(`Database: ${host}`)
    const me = await prisma.user.findFirst({ where: { email, source: 'learn' } })
    if (!me) throw new Error(`No LearnDifferently account for ${email}. Sign in once first.`)

    if (remove) {
      const a = await prisma.joinRequest.deleteMany({
        where: { cohortId: COHORT, userId: { in: REQUESTERS } },
      })
      const b = await prisma.supportItem.deleteMany({ where: { id: SUPPORT_ID } })
      const c = await prisma.ltiPlatform.deleteMany({ where: { id: PLATFORM_ID } })
      console.log(
        `Removed ${a.count} join requests, ${b.count} support items, ${c.count} platforms.`
      )
      return
    }

    for (const userId of REQUESTERS) {
      await prisma.joinRequest.upsert({
        where: { cohortId_userId: { cohortId: COHORT, userId } },
        create: { cohortId: COHORT, userId },
        update: { status: 'pending', decidedAt: null, decidedBy: null },
      })
    }
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const name = me.displayName ?? me.email ?? me.id
    await prisma.supportItem.upsert({
      where: { id: SUPPORT_ID },
      create: {
        id: SUPPORT_ID,
        providerId: PROVIDER,
        userId: SUPPORT_ABOUT,
        cohortId: COHORT,
        title: 'Bus pass for week six',
        category: 'transportation',
        status: 'open',
        dueDate: yesterday,
        assigneeId: me.id,
        assigneeName: name,
        createdById: me.id,
        createdByName: name,
      },
      update: { status: 'open', dueDate: yesterday, assigneeId: me.id, assigneeName: name },
    })
    await prisma.ltiPlatform.upsert({
      where: { id: PLATFORM_ID },
      create: {
        id: PLATFORM_ID,
        name: 'Sample college LMS (demo)',
        issuer: 'https://lms.example.edu',
        clientId: 'demo-attn-client',
        deploymentId: 'demo-attn-deployment',
        authUrl: 'https://lms.example.edu/auth',
        tokenUrl: 'https://lms.example.edu/token',
        jwksUrl: 'https://lms.example.edu/jwks',
        enabled: false,
        approvedAt: null,
      },
      update: { enabled: false, approvedAt: null },
    })
    console.log('Added: 2 join requests, 1 overdue support follow-up for you, 1 platform waiting.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
