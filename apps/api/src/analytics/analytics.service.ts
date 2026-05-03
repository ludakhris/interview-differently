import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Aggregates SimulationResult / DimensionScore data scoped to an institution
 * (and optionally a specific cohort). Powers the institution + cohort
 * overview views from #2 Phase 6c.
 *
 * Membership of users to scope is via the `Membership` table. A user with
 * a membership in this institution but no cohort is included in institution
 * totals and surfaces in the cohort-breakdown as "(no cohort)".
 *
 * Note: traditional simulations only write a SimulationResult on completion,
 * so we don't have a real "completion rate" denominator yet. ImmersiveSession
 * has status=active|completed|abandoned which would give a true rate; folding
 * that in is a follow-up.
 */
@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getInstitutionAnalytics(institutionId: string, cohortId?: string) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
      select: { id: true, name: true, emailDomain: true },
    })
    if (!institution) throw new NotFoundException(`Institution ${institutionId} not found`)

    let cohort: { id: string; name: string } | null = null
    if (cohortId) {
      const c = await this.prisma.cohort.findUnique({
        where: { id: cohortId },
        select: { id: true, name: true, institutionId: true },
      })
      if (!c || c.institutionId !== institutionId) {
        throw new NotFoundException(`Cohort ${cohortId} not found in institution ${institutionId}`)
      }
      cohort = { id: c.id, name: c.name }
    }

    // 1. Members in scope (institution-wide, or restricted to a cohort)
    const memberRows = await this.prisma.membership.findMany({
      where: {
        institutionId,
        ...(cohortId ? { cohortId } : {}),
      },
      select: { userId: true },
    })
    const userIds = [...new Set(memberRows.map((m) => m.userId))]
    const totalStudents = userIds.length

    // Empty-state short-circuit — Prisma rejects in:[] differently across drivers, but
    // skipping the queries is also faster.
    if (userIds.length === 0) {
      return {
        institution,
        cohort,
        totalStudents: 0,
        activeStudentsLast30Days: 0,
        completedSimulations: 0,
        avgOverallScore: null,
        byTrack: [],
        byDimension: [],
        byCohort: cohortId ? null : await this.emptyCohortBreakdown(institutionId),
      }
    }

    // 2. SimulationResult rows for those users
    const results = await this.prisma.simulationResult.findMany({
      where: { userId: { in: userIds } },
      select: {
        id: true,
        userId: true,
        track: true,
        overallScore: true,
        completedAt: true,
        dimensionScores: { select: { dimension: true, score: true } },
      },
    })

    const completedSimulations = results.length
    const avgOverallScore = avg(results.map((r) => r.overallScore))

    // 3. Active in last 30 days = distinct userIds with at least one completion in window
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const activeStudentsLast30Days = new Set(
      results.filter((r) => r.completedAt >= cutoff).map((r) => r.userId),
    ).size

    // 4. Per-track + per-dimension breakdowns
    const byTrack = groupAvg(results, (r) => r.track, (r) => r.overallScore)
    const dimensionPairs = results.flatMap((r) => r.dimensionScores)
    const byDimension = groupAvg(
      dimensionPairs,
      (d) => d.dimension,
      (d) => d.score,
    )

    // 5. Per-cohort comparison (only when no cohort filter)
    const byCohort = cohortId ? null : await this.cohortBreakdown(institutionId, results)

    return {
      institution,
      cohort,
      totalStudents,
      activeStudentsLast30Days,
      completedSimulations,
      avgOverallScore,
      byTrack,
      byDimension,
      byCohort,
    }
  }

  /**
   * Per-cohort breakdown for an institution. Returns one row per cohort plus
   * an "(no cohort)" row for institution-only memberships, so the totals
   * always reconcile with the institution overview.
   */
  private async cohortBreakdown(
    institutionId: string,
    institutionResults: Array<{ userId: string; overallScore: number }>,
  ) {
    const cohorts = await this.prisma.cohort.findMany({
      where: { institutionId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    const memberships = await this.prisma.membership.findMany({
      where: { institutionId },
      select: { userId: true, cohortId: true },
    })

    type Bucket = { cohortId: string | null; name: string; userIds: Set<string> }
    const buckets = new Map<string | 'none', Bucket>()
    for (const c of cohorts) buckets.set(c.id, { cohortId: c.id, name: c.name, userIds: new Set() })
    buckets.set('none', { cohortId: null, name: '(no cohort)', userIds: new Set() })

    for (const m of memberships) {
      const key = m.cohortId ?? 'none'
      buckets.get(key)?.userIds.add(m.userId)
    }

    return [...buckets.values()]
      .filter((b) => b.userIds.size > 0)
      .map((b) => {
        const scopedResults = institutionResults.filter((r) => b.userIds.has(r.userId))
        return {
          cohortId: b.cohortId,
          name: b.name,
          totalStudents: b.userIds.size,
          completedSimulations: scopedResults.length,
          avgOverallScore: avg(scopedResults.map((r) => r.overallScore)),
        }
      })
  }

  /** Emit cohort rows even when there are no results yet — useful for new institutions. */
  private async emptyCohortBreakdown(institutionId: string) {
    const cohorts = await this.prisma.cohort.findMany({
      where: { institutionId },
      select: { id: true, name: true, _count: { select: { memberships: true } } },
      orderBy: { name: 'asc' },
    })
    return cohorts.map((c) => ({
      cohortId: c.id,
      name: c.name,
      totalStudents: c._count.memberships,
      completedSimulations: 0,
      avgOverallScore: null,
    }))
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10
}

function groupAvg<T, K extends string>(
  items: T[],
  keyFn: (item: T) => K,
  valueFn: (item: T) => number,
): Array<{ key: K; count: number; avg: number }> {
  const groups = new Map<K, number[]>()
  for (const item of items) {
    const k = keyFn(item)
    const arr = groups.get(k) ?? []
    arr.push(valueFn(item))
    groups.set(k, arr)
  }
  return [...groups.entries()]
    .map(([key, values]) => ({
      key,
      count: values.length,
      avg: Math.round((values.reduce((s, n) => s + n, 0) / values.length) * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count)
}
