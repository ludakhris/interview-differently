/**
 * The platform that launches Interview Differently today (LearnDifferently, from env) as a row in
 * the platform table (#63), switched on. Until it is there the server falls back to the same
 * settings, so running this is what lets that fallback be removed.
 *
 * Each field comes from env (LTI_API_BASE and the optional LTI_PLATFORM_* / LTI_TOOL_CLIENT_ID /
 * LTI_DEPLOYMENT_ID overrides), so every environment points at its own host. It is safe to run
 * again: a platform already stored under the same issuer and client id is left exactly as it is
 * (never edited, never switched on or off). The row it adds is recorded in the history as made by
 * "System (seed script)".
 *
 * Usage (from apps/api):
 *   npm run seed:lti-platforms -- --dry-run              # show what would be added
 *   npm run seed:lti-platforms                           # add it if missing
 *   npm run seed:lti-platforms -- --allow-host <host>    # run against a non-dev database
 *
 * Refuses to run unless DATABASE_URL points at localhost or the Railway dev database. Pass
 * --allow-host for production only with the owner's OK, and with that environment's LTI_API_BASE set.
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { platformCreated } from '../src/lti/tool/platform-registry.service'
import { platformRegistration } from '../src/lti/tool/lti-tool.config'

const DEV_HOSTS = ['localhost', '127.0.0.1', 'zephyr.proxy.rlwy.net']
const WHO = { userId: null, userName: 'System (seed script)' }

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
  const allowHost = i >= 0 ? argv[i + 1] : undefined
  const host = targetHost(allowHost)
  if (allowHost) {
    // a non-dev database must get that environment's real URLs, never the localhost defaults
    const base = process.env.LTI_API_BASE
    if (!base || ['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname))
      throw new Error('With --allow-host, set LTI_API_BASE to that environment’s public API URL.')
  }
  const dryRun = argv.includes('--dry-run')
  const prisma = new PrismaClient()
  try {
    console.log(`Database: ${host}${dryRun ? ' (dry run: nothing is written)' : ''}`)
    const p = { name: 'LearnDifferently', ...platformRegistration() }
    const exists = await prisma.ltiPlatform.findUnique({
      where: { issuer_clientId: { issuer: p.issuer, clientId: p.clientId } },
    })
    console.log(`  issuer ${p.issuer}, client id ${p.clientId}, deployment ${p.deploymentId}`)
    console.log(`  auth ${p.authUrl}, token ${p.tokenUrl}, keys ${p.jwksUrl}`)
    console.log(`  platform: ${exists ? 'already there' : 'add'}`)
    if (dryRun || exists) {
      console.log(dryRun ? 'Dry run: nothing written.' : 'Nothing to add.')
      return
    }
    const id = crypto.randomUUID()
    await prisma.$transaction([
      prisma.ltiPlatform.create({
        data: { id, ...p, enabled: true, approvedAt: new Date() },
      }),
      prisma.ltiPlatformChange.create({
        data: {
          subjectId: id,
          subjectName: p.name,
          action: 'created',
          ...WHO,
          changes: platformCreated({ ...p, enabled: true }),
        },
      }),
    ])
    console.log('Added 1 platform.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
