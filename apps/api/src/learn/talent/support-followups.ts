import type { PrismaService } from '../../prisma/prisma.service'
import type { AttentionItem } from '../attention-types'
import { LEARN_ROLES } from '../learn.service'

/**
 * Follow-ups assigned to the person that are open or in progress and overdue or due today, one
 * alert item per institution whose queue they may open (ProviderAccessService.assertProviderStaff:
 * a system admin anywhere, a provider-admin with a workspace membership). Counts and the
 * institution's name only, for the "needs your attention" alert (#74); this folder is the only
 * place that reads the staff tables.
 */
export async function dueSupportFollowUps(
  prisma: PrismaService,
  userId: string,
  role: string | undefined,
  now: Date
): Promise<AttentionItem[]> {
  const endOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  )
  const counts = await prisma.supportItem.groupBy({
    by: ['providerId'],
    where: {
      assigneeId: userId,
      status: { in: ['open', 'in_progress'] },
      dueDate: { lt: endOfToday },
      ...(role === LEARN_ROLES.systemAdmin
        ? {}
        : {
            provider: {
              kind: { in: ['provider', 'organization'] },
              memberships: { some: { userId, cohortId: null } },
            },
          }),
    },
    _count: { _all: true },
  })
  if (counts.length === 0) return []
  const institutions = await prisma.institution.findMany({
    where: { id: { in: counts.map((c) => c.providerId) }, subdomain: { not: null } },
    select: { id: true, name: true, subdomain: true },
    orderBy: { name: 'asc' },
  })
  const due = new Map(counts.map((c) => [c.providerId, c._count._all]))
  return institutions.map((p): AttentionItem => {
    const count = due.get(p.id) ?? 0
    return {
      kind: 'support_followups',
      title: `${count} ${count === 1 ? 'support follow-up is' : 'support follow-ups are'} due`,
      detail: p.name,
      count,
      href: `/lms/talent/support?site=${encodeURIComponent(p.subdomain as string)}`,
    }
  })
}
