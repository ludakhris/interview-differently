import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { DataAccessLogService } from '../data-access-log.service'
import { ProviderAccessService } from '../provider-access.service'
import type {
  ActivityDay,
  CohortActivityLearnerRow,
  CohortActivityReport,
  LearnerActivityReport,
} from '../activity-types'
import {
  activityCsv,
  type CsvRow,
  decideBeat,
  eachDay,
  ENDED_GRACE_MS,
  MAX_TOOL_ESTIMATE_S,
  parseRange,
  splitToolEstimate,
  utcDay,
  type DateRange,
} from './activity-rules'

const NO_ITEM_TITLE = 'Course pages (outline, dashboard)'
const REMOVED_ITEM_TITLE = 'Removed item'

const num = (v: unknown): number => Number(v ?? 0)
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)

/**
 * Time learners spent in online courses (#69 E).
 * Measured: a heartbeat from the learner pages while the page was visible and the learner active.
 * Estimated: a connected tool's time from launch (an open row) to score return (closes it) (`estimated` true, always reported apart).
 */
@Injectable()
export class ActivityService {
  constructor(
    readonly prisma: PrismaService,
    readonly access: ProviderAccessService,
    readonly audit: DataAccessLogService
  ) {}

  // ── learner write ─────────────────────────────────────────────────────────

  /**
   * One heartbeat. Never throws for a beat that is simply not counted (not enrolled, withdrawn,
   * wrong item, ended cohort, too soon): the client gets 204 either way. The learner is the
   * caller, so a beat can only ever touch their own enrollment. `now` is the server's clock.
   */
  async heartbeat(userId: string, body: unknown, now: Date = new Date()): Promise<void> {
    const b = (body ?? {}) as Record<string, unknown>
    if (typeof b.cohortId !== 'string' || !b.cohortId || b.cohortId.length > 100)
      throw new BadRequestException('cohortId is required')
    if (
      b.itemId !== undefined &&
      b.itemId !== null &&
      (typeof b.itemId !== 'string' || b.itemId.length > 100)
    )
      throw new BadRequestException('itemId must be text')
    // Tool time is estimated from launch to score return, never reported by the browser.
    if (b.kind !== 'page') return
    const itemId = typeof b.itemId === 'string' && b.itemId ? b.itemId : null

    const e = await this.prisma.enrollment.findUnique({
      where: { cohortId_userId: { cohortId: b.cohortId, userId } },
      select: {
        id: true,
        status: true,
        cohort: { select: { courseId: true, startsAt: true, endsAt: true } },
      },
    })
    if (!e || e.status === 'withdrawn') return
    const { startsAt, endsAt, courseId } = e.cohort
    if (startsAt && startsAt.getTime() > now.getTime()) return
    if (endsAt && now.getTime() - endsAt.getTime() > ENDED_GRACE_MS) return
    if (itemId) {
      const item = await this.prisma.courseItem.findFirst({
        where: { id: itemId, module: { courseId: courseId ?? '' } },
        select: { id: true },
      })
      if (!item) return
    }

    const day = new Date(`${utcDay(now)}T00:00:00.000Z`)
    const last = await this.prisma.activitySession.findFirst({
      where: { enrollmentId: e.id, kind: 'page', estimated: false, day },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, itemId: true, lastSeenAt: true },
    })
    const decision = decideBeat(last, itemId, now)
    if (decision.action === 'ignore') return
    if (decision.action === 'add' && last) {
      // Only if nobody moved lastSeenAt since we read it: two tabs beating together count once.
      await this.prisma.activitySession.updateMany({
        where: { id: last.id, lastSeenAt: last.lastSeenAt },
        data: { seconds: { increment: decision.seconds }, lastSeenAt: now },
      })
      return
    }
    await this.prisma.activitySession.create({
      data: {
        userId,
        enrollmentId: e.id,
        itemId,
        kind: 'page',
        day,
        startedAt: now,
        lastSeenAt: now,
        seconds: 0,
        estimated: false,
      },
    })
  }

  /**
   * A learner launched a connected tool: opens one `tool` row (estimated, seconds 0, lastSeenAt =
   * startedAt, which marks it open). A repeat launch within 4 hours of an open row reuses it, so
   * rows do not stack. Callers treat this as best effort.
   */
  async openToolLaunch(
    enrollmentId: string,
    userId: string,
    itemId: string,
    now: Date = new Date()
  ): Promise<void> {
    const open = await this.findOpenToolRow(enrollmentId, itemId, now)
    if (open) return
    await this.prisma.activitySession.create({
      data: {
        userId,
        enrollmentId,
        itemId,
        kind: 'tool',
        day: new Date(`${utcDay(now)}T00:00:00.000Z`),
        startedAt: now,
        lastSeenAt: now,
        seconds: 0,
        estimated: true,
      },
    })
  }

  /** A tool row not yet closed (lastSeenAt still equals startedAt) that started within 4 hours. */
  private async findOpenToolRow(enrollmentId: string, itemId: string, now: Date) {
    const rows = await this.prisma.activitySession.findMany({
      where: {
        enrollmentId,
        itemId,
        kind: 'tool',
        estimated: true,
        startedAt: { gte: new Date(now.getTime() - MAX_TOOL_ESTIMATE_S * 1000) },
      },
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: { id: true, userId: true, startedAt: true, lastSeenAt: true },
    })
    return rows.find((r) => r.lastSeenAt.getTime() === r.startedAt.getTime()) ?? null
  }

  /**
   * A score came back: closes the latest open tool row for this enrollment and item. Seconds are
   * launch to now, never negative, at most 4 hours, split at UTC midnight (the first part stays on
   * the row, a later part gets its own row). No open launch row means nothing is written; a
   * repeated report finds the row closed and adds nothing.
   */
  async closeToolLaunch(
    enrollmentId: string,
    itemId: string,
    now: Date = new Date()
  ): Promise<void> {
    const open = await this.findOpenToolRow(enrollmentId, itemId, now)
    if (!open) return
    const [first, ...rest] = splitToolEstimate(open.startedAt, now)
    // Nothing elapsed: still mark it closed so a retried report cannot count the launch later.
    const closedAt = first?.lastSeenAt ?? new Date(open.startedAt.getTime() + 1)
    // Only if still open: two reports at once close it once.
    const done = await this.prisma.activitySession.updateMany({
      where: { id: open.id, lastSeenAt: open.lastSeenAt },
      data: { seconds: first?.seconds ?? 0, lastSeenAt: closedAt },
    })
    if (done.count === 0) return
    for (const part of rest)
      await this.prisma.activitySession.create({
        data: {
          userId: open.userId,
          enrollmentId,
          itemId,
          kind: 'tool',
          day: new Date(`${part.day}T00:00:00.000Z`),
          startedAt: part.startedAt,
          lastSeenAt: part.lastSeenAt,
          seconds: part.seconds,
          estimated: true,
        },
      })
  }

  // ── reports ───────────────────────────────────────────────────────────────

  private range(from: unknown, to: unknown): DateRange {
    const r = parseRange(from, to)
    if ('error' in r) throw new BadRequestException(r.error)
    return r.range
  }

  /** The cohort's daily activity. Staff only (the roster guard). */
  async cohortReport(
    userId: string,
    role: string | undefined,
    cohortId: string,
    from: unknown,
    to: unknown
  ): Promise<CohortActivityReport> {
    await this.access.assertCohortStaff(userId, role, cohortId)
    const range = this.range(from, to)
    return this.buildCohortReport(cohortId, range)
  }

  private async buildCohortReport(
    cohortId: string,
    range: DateRange
  ): Promise<CohortActivityReport> {
    const params = [cohortId, range.from, range.to]
    const where = `e."cohortId" = $1 AND a."day" BETWEEN $2::date AND $3::date`
    const [people, perLearner, perDay, perItem] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { cohortId },
        select: {
          userId: true,
          status: true,
          user: { select: { displayName: true, email: true } },
        },
      }),
      this.prisma.$queryRawUnsafe<
        {
          userId: string
          total: unknown
          estimated: unknown
          activeDays: unknown
          firstSeen: Date | null
          lastSeen: Date | null
        }[]
      >(
        `SELECT a."userId" AS "userId",
                COALESCE(SUM(a."seconds"), 0) AS total,
                COALESCE(SUM(a."seconds") FILTER (WHERE a."estimated"), 0) AS estimated,
                COUNT(DISTINCT a."day") FILTER (WHERE a."seconds" > 0) AS "activeDays",
                MIN(a."startedAt") AS "firstSeen",
                MAX(a."lastSeenAt") AS "lastSeen"
           FROM "ActivitySession" a JOIN "Enrollment" e ON e."id" = a."enrollmentId"
          WHERE ${where}
          GROUP BY a."userId"`,
        ...params
      ),
      this.prisma.$queryRawUnsafe<{ day: string; seconds: unknown; learners: unknown }[]>(
        `SELECT to_char(a."day", 'YYYY-MM-DD') AS day,
                COALESCE(SUM(a."seconds"), 0) AS seconds,
                COUNT(DISTINCT a."userId") FILTER (WHERE a."seconds" > 0) AS learners
           FROM "ActivitySession" a JOIN "Enrollment" e ON e."id" = a."enrollmentId"
          WHERE ${where}
          GROUP BY a."day"`,
        ...params
      ),
      this.prisma.$queryRawUnsafe<
        { itemId: string | null; title: string | null; seconds: unknown; learners: unknown }[]
      >(
        `SELECT a."itemId" AS "itemId", i."title" AS title,
                COALESCE(SUM(a."seconds"), 0) AS seconds,
                COUNT(DISTINCT a."userId") FILTER (WHERE a."seconds" > 0) AS learners
           FROM "ActivitySession" a JOIN "Enrollment" e ON e."id" = a."enrollmentId"
           LEFT JOIN "CourseItem" i ON i."id" = a."itemId"
          WHERE ${where}
          GROUP BY a."itemId", i."title"
          ORDER BY seconds DESC, title ASC`,
        ...params
      ),
    ])

    const stats = new Map(perLearner.map((r) => [r.userId, r]))
    const learners: CohortActivityLearnerRow[] = people
      // A withdrawn learner is listed only if they have time in the range.
      .filter((p) => p.status !== 'withdrawn' || stats.has(p.userId))
      .map((p) => {
        const s = stats.get(p.userId)
        return {
          userId: p.userId,
          name: p.user.displayName || p.user.email || p.userId,
          totalSeconds: num(s?.total),
          estimatedSeconds: num(s?.estimated),
          activeDays: num(s?.activeDays),
          firstSeenAt: iso(s?.firstSeen),
          lastSeenAt: iso(s?.lastSeen),
        }
      })
      .sort((a, b) => b.totalSeconds - a.totalSeconds || a.name.localeCompare(b.name))

    const byDay = new Map(perDay.map((d) => [d.day, d]))
    const days = eachDay(range.from, range.to).map((day) => ({
      day,
      seconds: num(byDay.get(day)?.seconds),
      learners: num(byDay.get(day)?.learners),
    }))
    return {
      cohortId,
      from: range.from,
      to: range.to,
      totalSeconds: learners.reduce((n, l) => n + l.totalSeconds, 0),
      days,
      learners,
      items: perItem.map((r) => ({
        itemId: r.itemId,
        title: r.title ?? (r.itemId ? REMOVED_ITEM_TITLE : NO_ITEM_TITLE),
        seconds: num(r.seconds),
        learners: num(r.learners),
      })),
    }
  }

  /** One learner's day-by-day log. Staff only; 404 unless the person is enrolled in the cohort. */
  async learnerReport(
    userId: string,
    role: string | undefined,
    cohortId: string,
    learnerId: string,
    from: unknown,
    to: unknown
  ): Promise<LearnerActivityReport> {
    await this.access.assertCohortStaff(userId, role, cohortId)
    const range = this.range(from, to)
    await this.access.assertLearnerOfCohort(learnerId, cohortId)
    return this.buildLearnerReport(cohortId, learnerId, range)
  }

  /** The caller's own report. */
  async ownReport(
    userId: string,
    cohortId: string,
    from: unknown,
    to: unknown
  ): Promise<LearnerActivityReport> {
    await this.access.assertLearnerOfCohort(userId, cohortId)
    return this.buildLearnerReport(cohortId, userId, this.range(from, to))
  }

  private async buildLearnerReport(
    cohortId: string,
    learnerId: string,
    range: DateRange
  ): Promise<LearnerActivityReport> {
    const [user, rows] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: learnerId },
        select: { displayName: true, email: true },
      }),
      this.prisma.$queryRawUnsafe<
        {
          day: string
          itemId: string | null
          title: string | null
          estimated: boolean
          seconds: unknown
          firstSeen: Date
          lastSeen: Date
        }[]
      >(
        `SELECT to_char(a."day", 'YYYY-MM-DD') AS day, a."itemId" AS "itemId", i."title" AS title,
                a."estimated" AS estimated, COALESCE(SUM(a."seconds"), 0) AS seconds,
                MIN(a."startedAt") AS "firstSeen", MAX(a."lastSeenAt") AS "lastSeen"
           FROM "ActivitySession" a JOIN "Enrollment" e ON e."id" = a."enrollmentId"
           LEFT JOIN "CourseItem" i ON i."id" = a."itemId"
          WHERE e."cohortId" = $1 AND e."userId" = $2 AND a."day" BETWEEN $3::date AND $4::date
          GROUP BY a."day", a."itemId", i."title", a."estimated"
          ORDER BY a."day" ASC, title ASC NULLS FIRST, a."estimated" ASC`,
        cohortId,
        learnerId,
        range.from,
        range.to
      ),
    ])
    const days = new Map<string, ActivityDay>()
    for (const r of rows) {
      const d = days.get(r.day) ?? {
        day: r.day,
        seconds: 0,
        firstSeenAt: r.firstSeen.toISOString(),
        lastSeenAt: r.lastSeen.toISOString(),
        items: [],
      }
      d.seconds += num(r.seconds)
      if (r.firstSeen.toISOString() < d.firstSeenAt) d.firstSeenAt = r.firstSeen.toISOString()
      if (r.lastSeen.toISOString() > d.lastSeenAt) d.lastSeenAt = r.lastSeen.toISOString()
      d.items.push({
        itemId: r.itemId,
        title: r.title ?? (r.itemId ? REMOVED_ITEM_TITLE : NO_ITEM_TITLE),
        seconds: num(r.seconds),
        estimated: r.estimated,
      })
      days.set(r.day, d)
    }
    const list = [...days.values()]
    return {
      cohortId,
      userId: learnerId,
      name: user?.displayName || user?.email || learnerId,
      from: range.from,
      to: range.to,
      totalSeconds: list.reduce((n, d) => n + d.seconds, 0),
      activeDays: list.filter((d) => d.seconds > 0).length,
      days: list,
    }
  }

  /** One row per learner per day per item, for grant reporting. Staff only. */
  async cohortCsv(
    userId: string,
    role: string | undefined,
    cohortId: string,
    from: unknown,
    to: unknown
  ): Promise<string> {
    await this.access.assertCohortStaff(userId, role, cohortId)
    const range = this.range(from, to)
    const rows = await this.prisma.$queryRawUnsafe<
      {
        name: string | null
        email: string | null
        day: string
        itemId: string | null
        title: string | null
        kind: string
        estimated: boolean
        seconds: unknown
      }[]
    >(
      `SELECT u."displayName" AS name, u."email" AS email, to_char(a."day", 'YYYY-MM-DD') AS day,
              a."itemId" AS "itemId", i."title" AS title, a."kind" AS kind,
              a."estimated" AS estimated, COALESCE(SUM(a."seconds"), 0) AS seconds
         FROM "ActivitySession" a
         JOIN "Enrollment" e ON e."id" = a."enrollmentId"
         JOIN "User" u ON u."id" = a."userId"
         LEFT JOIN "CourseItem" i ON i."id" = a."itemId"
        WHERE e."cohortId" = $1 AND a."day" BETWEEN $2::date AND $3::date
        GROUP BY u."id", u."displayName", u."email", a."day", a."itemId", i."title", a."kind", a."estimated"
       HAVING SUM(a."seconds") > 0
        ORDER BY COALESCE(u."displayName", u."email", u."id") ASC, a."day" ASC, title ASC NULLS FIRST`,
      cohortId,
      range.from,
      range.to
    )
    const csv: CsvRow[] = rows.map((r) => ({
      name: r.name || r.email || '',
      email: r.email,
      day: r.day,
      item: r.title ?? (r.itemId ? REMOVED_ITEM_TITLE : NO_ITEM_TITLE),
      kind: r.kind,
      seconds: num(r.seconds),
      estimated: r.estimated,
    }))
    return activityCsv(csv)
  }
}
