import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ClerkService } from '../auth/clerk.service'
import { buildUsage, type UsageInput, type UsageRange, type UsageReport } from './usage.aggregate'

/** Clerk roles treated as admin/test traffic and excluded unless asked for. */
const ADMIN_ROLES = new Set(['admin', 'institution-admin'])

@Injectable()
export class UsageService {
  constructor(
    private prisma: PrismaService,
    private clerk: ClerkService
  ) {}

  async report(opts: {
    range: UsageRange
    includeAdmins: boolean
    tzOffsetMinutes: number
  }): Promise<UsageReport> {
    const [
      users,
      scenarios,
      simAttempts,
      simResults,
      immersive,
      assessments,
      attempts,
      sqlLogs,
      cohorts,
      pageViews,
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
      this.prisma.sqlQueryLog.findMany({
        select: { userId: true, datasetSlug: true, ok: true, createdAt: true },
      }),
      this.prisma.cohort.findMany({
        select: {
          id: true,
          name: true,
          institution: { select: { name: true } },
          memberships: { select: { userId: true } },
          tools: { select: { toolKey: true, enabled: true } },
        },
      }),
      this.prisma.usageEvent.findMany({
        select: { userId: true, route: true, refId: true, createdAt: true },
      }),
    ])

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
      now: new Date(),
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
