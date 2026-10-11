import type { PrismaService } from '../../prisma/prisma.service'
import type { AttentionItem } from '../attention-types'

/**
 * Follow-ups assigned to the person that are open or in progress and overdue or due today, one
 * alert item per institution whose queue they may open (`institutionIds`, the ones where they hold
 * `participant.records`; null for a system admin, who may open any). Counts and the
 * institution's name only, for the "needs your attention" alert (#74); this folder is the only
 * place that reads the staff tables.
 */
export async function dueSupportFollowUps(
  prisma: PrismaService,
  userId: string,
  institutionIds: string[] | null,
  now: Date
): Promise<AttentionItem[]> {
  if (institutionIds && institutionIds.length === 0) return []
  const endOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  )
  const counts = await prisma.supportItem.groupBy({
    by: ['providerId'],
    where: {
      assigneeId: userId,
      status: { in: ['open', 'in_progress'] },
      dueDate: { lt: endOfToday },
      ...(institutionIds
        ? {
            providerId: { in: institutionIds },
            provider: { kind: { in: ['provider', 'organization'] } },
          }
        : {}),
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
