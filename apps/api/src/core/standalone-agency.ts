import type { PrismaClient } from '@prisma/client'

/**
 * Every institution belongs to an agency (the tenant, see GitHub issue #84). Institutions made in
 * standalone Interview Differently have no agency of their own, so they all sit under this one.
 * It has no subdomain, so it never appears as a Learn Differently workspace.
 */
export const STANDALONE_AGENCY_ID = 'interview-differently-standalone'
export const STANDALONE_AGENCY_NAME = 'Interview Differently Standalone'

/** Creates the standalone agency if it is missing. Safe to call on every write. */
export async function ensureStandaloneAgency(
  db: Pick<PrismaClient, 'institution'>
): Promise<string> {
  await db.institution.upsert({
    where: { id: STANDALONE_AGENCY_ID },
    update: {},
    create: { id: STANDALONE_AGENCY_ID, name: STANDALONE_AGENCY_NAME, kind: 'agency' },
  })
  return STANDALONE_AGENCY_ID
}
