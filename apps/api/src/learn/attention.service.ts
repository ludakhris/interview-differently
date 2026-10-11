import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { AttentionItem, AttentionSummary } from './attention-types'
import { AccessService } from './access/access.service'
import { allows } from './access/permissions'
import { LearnService } from './learn.service'
import { dueSupportFollowUps } from './talent/support-followups'
import {
  loadProfileFacts,
  refreshMonthsOf,
  requirementState,
  type ProfileRequirementState,
} from './talent/profile-requirement'

/** Most cohorts listed on the alert; the rest are not hidden from their pages, just from the bell. */
const MAX_COHORT_ITEMS = 20

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const site = (path: string, subdomain: string) => `${path}?site=${encodeURIComponent(subdomain)}`

/**
 * "Needs your attention" (#74): waiting work the signed-in person can act on, as counts. Every rule
 * here repeats one that already exists (cohort roster access, the support queue, platform approval,
 * the profile requirement); nothing widens access. Titles, notes and participant names are never
 * returned, because the alert shows on every page.
 */
@Injectable()
export class AttentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly learn: LearnService,
    private readonly access: AccessService
  ) {}

  async forUser(
    userId: string,
    role: string | undefined,
    now = new Date()
  ): Promise<AttentionSummary> {
    const actor = { userId, role }
    const system = this.access.isSystemAdmin(actor)
    const workspaces = await this.learn.workspaces(userId, role)
    const [joins, support, platforms, profile] = await Promise.all([
      this.joinRequests(
        system ? workspaces : workspaces.filter((w) => allows([w.role], 'cohort.manage'))
      ),
      dueSupportFollowUps(
        this.prisma,
        userId,
        system ? null : await this.access.recordInstitutions(actor),
        now
      ),
      system ? this.platforms() : [],
      this.profile(userId, now),
    ])
    const items = [...joins, ...support, ...platforms, ...profile]
    return { items, total: items.reduce((n, i) => n + (i.count ?? 1), 0) }
  }

  /** Pending join requests, one item per cohort in a workspace the person may manage (LearnCohortsService.cohortFor). */
  private async joinRequests(workspaces: { id: string }[]): Promise<AttentionItem[]> {
    if (workspaces.length === 0) return []
    const counts = await this.prisma.joinRequest.groupBy({
      by: ['cohortId'],
      where: {
        status: 'pending',
        cohort: { courseId: { not: null }, institutionId: { in: workspaces.map((w) => w.id) } },
      },
      _count: { _all: true },
    })
    if (counts.length === 0) return []
    const cohorts = await this.prisma.cohort.findMany({
      where: { id: { in: counts.map((c) => c.cohortId) } },
      select: { id: true, name: true, institution: { select: { subdomain: true } } },
      orderBy: { name: 'asc' },
      take: MAX_COHORT_ITEMS,
    })
    const waiting = new Map(counts.map((c) => [c.cohortId, c._count._all]))
    return cohorts.map((c): AttentionItem => {
      const count = waiting.get(c.id) ?? 0
      return {
        kind: 'join_requests',
        title: `${plural(count, 'person is', 'people are')} waiting to join ${c.name}`,
        count,
        href: site(`/lms/cohorts/${c.id}`, c.institution.subdomain as string),
      }
    })
  }

  /** Platforms that registered themselves and wait for approval (the rule of PlatformRegistry.pendingCount). */
  private async platforms(): Promise<AttentionItem[]> {
    const count = await this.prisma.ltiPlatform.count({
      where: { enabled: false, approvedAt: null },
    })
    if (count === 0) return []
    return [
      {
        kind: 'platforms',
        title: `${plural(count, 'platform is', 'platforms are')} waiting for approval`,
        count,
        href: '/lms/admin/tools',
      },
    ]
  }

  /** The person's own profile, when a cohort they are in requires it and it is missing, unfinished or stale. */
  private async profile(userId: string, now: Date): Promise<AttentionItem[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: {
        userId,
        status: { not: 'withdrawn' },
        cohort: { courseId: { not: null }, requiresProfile: true },
      },
      select: { cohort: { select: { requiresProfile: true, profileRefreshMonths: true } } },
    })
    if (rows.length === 0) return []
    const facts = await loadProfileFacts(this.prisma, userId)
    const states = rows.map((r) => requirementState(facts, refreshMonthsOf(r.cohort), now))
    const open = states.filter((s): s is Exclude<ProfileRequirementState, 'done'> => s !== 'done')
    if (open.length === 0) return []
    const refresh = open.every((s) => s === 'needs_refresh')
    return [
      {
        kind: 'profile',
        title: refresh ? 'Time to refresh your profile' : 'Your course needs your profile',
        detail: refresh ? undefined : 'Finish it so your course can continue.',
        href: '/lms/learning/profile',
      },
    ]
  }
}
