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
        startedSimulations: 0,
        completionRate: null,
        avgOverallScore: null,
        byTrack: [],
        byDimension: [],
        byCohort: cohortId ? null : await this.emptyCohortBreakdown(institutionId),
      }
    }

    // 2. SimulationResult + SimulationAttempt + ImmersiveSession rows for those users
    const [results, traditionalAttempts, immersiveSessions] = await Promise.all([
      this.prisma.simulationResult.findMany({
        where: { userId: { in: userIds } },
        select: {
          id: true,
          userId: true,
          track: true,
          overallScore: true,
          completedAt: true,
          dimensionScores: { select: { dimension: true, score: true } },
        },
      }),
      this.prisma.simulationAttempt.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, scenarioId: true, startedAt: true },
      }),
      this.prisma.immersiveSession.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, status: true, createdAt: true },
      }),
    ])

    const completedSimulations = results.length
    const avgOverallScore = avg(results.map((r) => r.overallScore))

    // Completion rate combines traditional + immersive starts/finishes.
    // Traditional: SimulationAttempt = start, SimulationResult = finish.
    // Immersive: ImmersiveSession (any status) = start, status='completed' = finish.
    // We do NOT pair a specific attempt to a specific result — cardinality is
    // counts only, which is what an org-level rate cares about.
    const traditionalStarts = traditionalAttempts.length
    const immersiveStarts = immersiveSessions.length
    const immersiveCompleted = immersiveSessions.filter((s) => s.status === 'completed').length
    const startedSimulations = traditionalStarts + immersiveStarts
    const completionRate =
      startedSimulations === 0
        ? null
        : Math.round(((completedSimulations + immersiveCompleted) / startedSimulations) * 1000) / 10

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
      startedSimulations,
      completionRate,
      avgOverallScore,
      byTrack,
      byDimension,
      byCohort,
    }
  }

  /**
   * Per-scenario engagement metrics for an institution (optionally filtered
   * to a cohort). One row per scenarioId combining traditional + immersive
   * activity, since both share the same scenarioId space.
   *
   *   starts        = SimulationAttempt count + ImmersiveSession count
   *   completions   = SimulationResult count + ImmersiveSession count where status='completed'
   *   drops         = max(0, starts - completions)
   *   retriedUsers  = distinct users with >= 2 starts of this scenario
   *   avgScore      = mean SimulationResult.overallScore (immersive sessions
   *                   don't have a comparable single score; we exclude them)
   */
  async getScenarioEngagement(institutionId: string, cohortId?: string) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
      select: { id: true, name: true },
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

    const memberRows = await this.prisma.membership.findMany({
      where: { institutionId, ...(cohortId ? { cohortId } : {}) },
      select: { userId: true },
    })
    const userIds = [...new Set(memberRows.map((m) => m.userId))]
    if (userIds.length === 0) {
      return { institution, cohort, scenarios: [] as ScenarioEngagementRow[] }
    }

    const [attempts, results, sessions] = await Promise.all([
      this.prisma.simulationAttempt.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, scenarioId: true },
      }),
      this.prisma.simulationResult.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, scenarioId: true, scenarioTitle: true, overallScore: true },
      }),
      this.prisma.immersiveSession.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, scenarioId: true, status: true },
      }),
    ])

    // Pull human titles. SimulationResult denormalises scenarioTitle, so the
    // primary source is "first scenarioTitle we saw for this scenarioId".
    // Anything not in that map (only-attempted / immersive-only / never-completed)
    // falls back to the Scenarios table, then to the raw scenarioId.
    const titleFromResults = new Map<string, string>()
    for (const r of results) {
      if (!titleFromResults.has(r.scenarioId)) titleFromResults.set(r.scenarioId, r.scenarioTitle)
    }
    const allScenarioIds = new Set<string>([
      ...attempts.map((a) => a.scenarioId),
      ...results.map((r) => r.scenarioId),
      ...sessions.map((s) => s.scenarioId),
    ])
    const missingTitleIds = [...allScenarioIds].filter((id) => !titleFromResults.has(id))
    const scenarioRows = missingTitleIds.length === 0
      ? []
      : await this.prisma.scenario.findMany({
          where: { scenarioId: { in: missingTitleIds } },
          select: { scenarioId: true, data: true },
        })
    const titleFromScenarios = new Map<string, string>()
    for (const row of scenarioRows) {
      const data = row.data as { title?: unknown } | null
      const title = data && typeof data === 'object' && typeof data.title === 'string' ? data.title : null
      if (title) titleFromScenarios.set(row.scenarioId, title)
    }

    // Bucket starts (attempts + sessions) and completions per scenarioId.
    type Bucket = {
      starts: number
      completions: number
      startUserCounts: Map<string, number>
      scores: number[]
      modes: Set<'traditional' | 'immersive'>
    }
    const buckets = new Map<string, Bucket>()
    function bucketFor(id: string): Bucket {
      let b = buckets.get(id)
      if (!b) {
        b = {
          starts: 0,
          completions: 0,
          startUserCounts: new Map(),
          scores: [],
          modes: new Set(),
        }
        buckets.set(id, b)
      }
      return b
    }

    for (const a of attempts) {
      const b = bucketFor(a.scenarioId)
      b.starts++
      b.modes.add('traditional')
      b.startUserCounts.set(a.userId, (b.startUserCounts.get(a.userId) ?? 0) + 1)
    }
    for (const r of results) {
      const b = bucketFor(r.scenarioId)
      b.completions++
      b.scores.push(r.overallScore)
    }
    for (const s of sessions) {
      const b = bucketFor(s.scenarioId)
      b.starts++
      b.modes.add('immersive')
      b.startUserCounts.set(s.userId, (b.startUserCounts.get(s.userId) ?? 0) + 1)
      if (s.status === 'completed') b.completions++
    }

    const scenarios: ScenarioEngagementRow[] = [...buckets.entries()]
      .map(([scenarioId, b]) => ({
        scenarioId,
        scenarioTitle:
          titleFromResults.get(scenarioId) ??
          titleFromScenarios.get(scenarioId) ??
          scenarioId,
        starts: b.starts,
        completions: b.completions,
        completionRate:
          b.starts === 0 ? null : Math.round((b.completions / b.starts) * 1000) / 10,
        drops: Math.max(0, b.starts - b.completions),
        retriedUsers: [...b.startUserCounts.values()].filter((c) => c >= 2).length,
        avgScore: avg(b.scores),
        mode: ((): 'traditional' | 'immersive' | 'mixed' => {
          if (b.modes.size === 0) return 'traditional'
          if (b.modes.size === 1) return [...b.modes][0]
          return 'mixed'
        })(),
      }))
      .sort((a, b) => b.starts - a.starts || a.scenarioTitle.localeCompare(b.scenarioTitle))

    return { institution, cohort, scenarios }
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

export interface ScenarioEngagementRow {
  scenarioId: string
  scenarioTitle: string
  starts: number
  completions: number
  /** Percent (0–100). Null when nobody started yet. */
  completionRate: number | null
  drops: number
  retriedUsers: number
  /** Mean overallScore from SimulationResult; null when no completions. Immersive sessions excluded (no comparable single score). */
  avgScore: number | null
  /** Useful UI hint — does this scenario only get traditional plays, only immersive, or both? */
  mode: 'traditional' | 'immersive' | 'mixed'
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
