import { Prisma, type PrismaClient } from '@prisma/client'
import { buildUsage, type UsageInput, type UsageRange, type UsageReport } from './usage.aggregate'

/** Clerk roles treated as admin/test traffic and excluded unless asked for. */
const ADMIN_ROLES = new Set(['admin', 'institution-admin'])

const DAY_MS = 86_400_000
type SqlLogRow = { userId: string; datasetSlug: string; ok: boolean; createdAt: Date }
type PageViewRow = { userId: string; route: string; refId: string | null; createdAt: Date }

/** Just the slice of ClerkService the report needs — lets the worker thread pass its own. */
export interface RoleLookup {
  getRoles(userIds: string[]): Promise<Map<string, string | null>>
}

/**
 * Loads the usage data and runs the aggregate. Plain class (no Nest) so it
 * can run either in-process or inside the worker thread (usage.worker.ts).
 */
export class UsageReportBuilder {
  constructor(
    private prisma: PrismaClient,
    private clerk: RoleLookup
  ) {}

  /**
   * The two append-only logs (SqlQueryLog, UsageEvent) dominate volume. The
   * aggregate needs the selected range plus the previous period of equal
   * length, and — from all time — only each user's first and last activity
   * (for "new users" and 7/30/90-day active counts). So load the window in
   * full, and for anything older just one earliest and one latest row per
   * user. Same numbers as loading everything, a fraction of the rows.
   */
  private async loadLogs(range: UsageRange, now: Date) {
    const rangeDays = range === 'all' ? null : { '7d': 7, '30d': 30, '90d': 90 }[range]
    const since = rangeDays ? new Date(now.getTime() - 2 * rangeDays * DAY_MS) : null
    if (!since) {
      const [sqlLogs, pageViews] = await Promise.all([
        this.prisma.sqlQueryLog.findMany({
          select: { userId: true, datasetSlug: true, ok: true, createdAt: true },
        }),
        this.prisma.usageEvent.findMany({
          select: { userId: true, route: true, refId: true, createdAt: true },
        }),
      ])
      return { sqlLogs, pageViews }
    }
    const [sqlLogs, pageViews] = await Promise.all([
      this.prisma.$queryRaw<SqlLogRow[]>(Prisma.sql`
        SELECT "userId","datasetSlug",ok,"createdAt" FROM "SqlQueryLog" WHERE "createdAt" >= ${since}
        UNION ALL (SELECT DISTINCT ON ("userId") "userId","datasetSlug",ok,"createdAt" FROM "SqlQueryLog"
                   WHERE "createdAt" < ${since} ORDER BY "userId","createdAt" ASC)
        UNION ALL (SELECT DISTINCT ON ("userId") "userId","datasetSlug",ok,"createdAt" FROM "SqlQueryLog"
                   WHERE "createdAt" < ${since} ORDER BY "userId","createdAt" DESC)`),
      this.prisma.$queryRaw<PageViewRow[]>(Prisma.sql`
        SELECT "userId",route,"refId","createdAt" FROM "UsageEvent" WHERE "createdAt" >= ${since}
        UNION ALL (SELECT DISTINCT ON ("userId") "userId",route,"refId","createdAt" FROM "UsageEvent"
                   WHERE "createdAt" < ${since} ORDER BY "userId","createdAt" ASC)
        UNION ALL (SELECT DISTINCT ON ("userId") "userId",route,"refId","createdAt" FROM "UsageEvent"
                   WHERE "createdAt" < ${since} ORDER BY "userId","createdAt" DESC)`),
    ])
    return { sqlLogs, pageViews }
  }

  async build(opts: {
    range: UsageRange
    includeAdmins: boolean
    tzOffsetMinutes: number
  }): Promise<UsageReport> {
    const now = new Date()
    const [
      users,
      scenarios,
      simAttempts,
      simResults,
      immersive,
      assessments,
      attempts,
      logs,
      cohorts,
    ] = await Promise.all([
      this.prisma.user.findMany({ select: { id: true, email: true, displayName: true } }),
      // Pull just the few JSON fields we need — the full scenario body is huge.
      this.prisma.$queryRaw<
        {
          scenarioId: string
          status: string
          title: string | null
          track: string | null
          mode: string | null
        }[]
      >`SELECT "scenarioId", status, data->>'title' AS title, data->>'track' AS track, data->>'mode' AS mode FROM "Scenario"`,
      this.prisma.simulationAttempt.findMany({
        select: { userId: true, scenarioId: true, startedAt: true },
      }),
      this.prisma.simulationResult.findMany({
        select: {
          userId: true,
          scenarioId: true,
          scenarioTitle: true,
          completedAt: true,
          overallScore: true,
        },
      }),
      this.prisma.immersiveSession.findMany({
        select: { userId: true, scenarioId: true, status: true, createdAt: true },
      }),
      this.prisma.assessment.findMany({
        select: { id: true, title: true, deliveries: { select: { id: true } } },
      }),
      this.prisma.assessmentAttempt.findMany({
        select: {
          userId: true,
          deliveryId: true,
          startedAt: true,
          submittedAt: true,
          submittedLate: true,
          sectionScores: true,
        },
      }),
      this.loadLogs(opts.range, now),
      this.prisma.cohort.findMany({
        select: {
          id: true,
          name: true,
          institution: { select: { name: true } },
          memberships: { select: { userId: true } },
          tools: { select: { toolKey: true, enabled: true } },
        },
      }),
    ])
    const { sqlLogs, pageViews } = logs

    const activeUserIds = new Set<string>([
      ...simAttempts.map((r) => r.userId),
      ...simResults.map((r) => r.userId),
      ...immersive.map((r) => r.userId),
      ...attempts.map((r) => r.userId),
      ...sqlLogs.map((r) => r.userId),
      ...pageViews.map((r) => r.userId),
    ])
    const excludedUserIds = new Set<string>()
    if (!opts.includeAdmins) {
      const roles = await this.clerk.getRoles([...activeUserIds])
      for (const [id, role] of roles) if (role && ADMIN_ROLES.has(role)) excludedUserIds.add(id)
    }

    const input: UsageInput = {
      now,
      range: opts.range,
      tzOffsetMinutes: opts.tzOffsetMinutes,
      excludedUserIds,
      users,
      scenarios,
      simAttempts,
      simResults,
      immersive,
      assessments: assessments.map((a) => ({
        id: a.id,
        title: a.title,
        deliveryIds: a.deliveries.map((d) => d.id),
      })),
      assessmentAttempts: attempts.map((a) => ({
        userId: a.userId,
        deliveryId: a.deliveryId,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        submittedLate: a.submittedLate,
        scorePercent: scorePercent(a.sectionScores),
      })),
      sqlLogs,
      pageViews,
      cohorts: cohorts.map((c) => {
        const enabled = (key: string) => c.tools.find((t) => t.toolKey === key)?.enabled ?? false
        return {
          id: c.id,
          name: c.name,
          institutionName: c.institution.name,
          memberIds: c.memberships.map((m) => m.userId),
          toolsEnabled: {
            'sql-sandbox': enabled('sql-sandbox'),
            assessments: enabled('assessments'),
          },
        }
      }),
    }
    return buildUsage(input)
  }
}

/** Overall percent from a submitted attempt's SectionScore[]; null if not submitted. */
function scorePercent(sectionScores: unknown): number | null {
  if (!Array.isArray(sectionScores)) return null
  let correct = 0
  let total = 0
  for (const s of sectionScores as { correct?: number; total?: number }[]) {
    correct += s.correct ?? 0
    total += s.total ?? 0
  }
  return total ? Math.round((correct / total) * 100) : 0
}
