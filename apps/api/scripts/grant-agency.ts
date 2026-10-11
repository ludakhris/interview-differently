/**
 * Gives a Learn Differently user a workspace-level membership in an agency (or any institution), which is
 * (a grant, marked with a role) what lets an agency admin open that agency's workspace and see its data
 * (GitHub issue #84). Pass --role to name it (default agency-admin).
 * They must have signed in once, so their user row exists. Run by hand:
 *
 *   npx ts-node -r tsconfig-paths/register scripts/grant-agency.ts --email you@example.org --workspace delaware --confirm-host <host>
 *   npx ts-node -r tsconfig-paths/register scripts/grant-agency.ts --email you@example.org --workspace delaware --revoke
 *
 * --workspace is the institution's subdomain. Prints what it did; changes nothing it does not name.
 */
import './lib/owner-env'
import { PrismaClient } from '@prisma/client'
import { assertBypassesRls, requireHostConfirmation } from './lib/db-guard'

const prisma = new PrismaClient()

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<void> {
  requireHostConfirmation()
  await assertBypassesRls(prisma)
  const email = flag('email')?.toLowerCase()
  const workspace = flag('workspace')
  if (!email || !workspace)
    throw new Error('Pass --email and --workspace (the institution subdomain)')
  const revoke = process.argv.includes('--revoke')
  const role = flag('role') ?? 'agency-admin'
  const ROLES = [
    'agency-admin',
    'provider-admin',
    'organization-admin',
    'case-manager',
    'instructor',
    'staff',
  ]
  if (!ROLES.includes(role)) throw new Error(`--role must be one of: ${ROLES.join(', ')}`)

  const user = await prisma.user.findFirst({ where: { email, source: 'learn' } })
  if (!user) throw new Error(`No Learn Differently user with email ${email}. Sign in once first.`)
  const institution = await prisma.institution.findFirst({ where: { subdomain: workspace } })
  if (!institution) throw new Error(`No institution with subdomain "${workspace}"`)

  const where = { userId: user.id, institutionId: institution.id, cohortId: null }
  const existing = await prisma.membership.findFirst({ where })
  if (revoke) {
    const done = await prisma.membership.deleteMany({ where })
    console.log(`Removed ${done.count} membership(s) for ${email} in ${institution.name}.`)
  } else if (existing) {
    if (!existing.role)
      await prisma.membership.update({ where: { id: existing.id }, data: { role } })
    console.log(
      `${email} already has a membership in ${institution.name}; it is now a ${role} grant.`
    )
  } else {
    await prisma.membership.create({ data: { ...where, role } })
    console.log(`Gave ${email} a ${role} grant in ${institution.name} (${institution.kind}).`)
  }
}

main()
  .catch((err) => {
    console.error(String(err.message ?? err))
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
