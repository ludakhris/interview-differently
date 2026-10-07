import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { DataAccessLogService } from '../data-access-log.service'
import { ProviderAccessService } from '../provider-access.service'
import type {
  ActivityDay,
  ActivitySessionRow,
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
  MAX_CSV_ROWS,
  MAX_TOOL_ESTIMATE_S,
  computeAverages,
  parseRange,
  parseTz,
  splitToolEstimate,
  utcDay,
  type DateRange,
} from './activity-rules'

const NO_ITEM_TITLE = 'Course pages (outline, dashboard)'
const REMOVED_ITEM_TITLE = 'Removed item'

const num = (v: unknown): number => Number(v ?? 0)
/** An item's name; the course pages when there is no item; a note when the item was removed. */
const itemTitle = (r: { itemId: string | null; title: string | null }): string =>
  r.title ?? (r.itemId ? REMOVED_ITEM_TITLE : NO_ITEM_TITLE)
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)

/**
 * Time learners spent in online courses (#69 E). One concept everywhere: a session has a start and
 * a duration (seconds of active time). Page rows come from a heartbeat from the learner pages
 * while the page was visible and the learner active (idle time is not counted); a connected tool's
 * row runs from launch to score return (the tool runs in another window). Reports read every row
 * the same way. Times are stored in UTC; reports bucket days in the viewer's timezone.
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
      orderBy: [{ lastSeenAt: 'desc' }, { startedAt: 'desc' }],
      select: { id: true, itemId: true, lastSeenAt: true },
    })
    const decision = decideBeat(last, itemId, now)
    if (decision.action === 'ignore') return
    if (decision.action === 'new' && decision.seconds > 0 && last) {
      // A switch to another item: claim the beat on the latest row first (nobody moved lastSeenAt
      // since we read it), so two tabs switching together credit the gap once. Then the new item's
      // row gets the gap. Credit never exceeds the wall-clock gap since the latest beat.
      const claimed = await this.prisma.activitySession.updateMany({
        where: { id: last.id, lastSeenAt: last.lastSeenAt },
        data: { lastSeenAt: now },
      })
      if (claimed.count === 0) return
    }
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
        seconds: decision.seconds,
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

  private range(from: unknown, to: unknown, tz: string): DateRange {
    const r = parseRange(from, to, new Date(), tz)
    if ('error' in r) throw new BadRequestException(r.error)
    return r.range
  }

  private zone(tz: unknown): string {
    const r = parseTz(tz)
    if ('error' in r) throw new BadRequestException(r.error)
    return r.tz
  }

  /**
   * The sessions of a cohort that have time, with each one's day in the viewer's timezone. A
   * session that crosses local midnight is attributed to the day it started. `startedAt` is a
   * zoneless UTC timestamp, so it is read as UTC first and then moved to the viewer's zone.
   * `day` (the UTC date of the start) narrows the scan by a day each side to use its index.
   * Params: $1 cohort, $2 from, $3 to, $4 tz, and $5 a learner when `learner` is true.
   */
  private sessions(learner = false): string {
    return `(SELECT a."userId", a."itemId", a."startedAt", a."lastSeenAt", a."seconds",
                    (a."startedAt" AT TIME ZONE 'UTC' AT TIME ZONE $4::text)::date AS "localDay"
               FROM "ActivitySession" a JOIN "Enrollment" e ON e."id" = a."enrollmentId"
              WHERE e."cohortId" = $1 ${learner ? 'AND e."userId" = $5' : ''}
                AND a."seconds" > 0
                AND a."day" BETWEEN ($2::date - 1) AND ($3::date + 1)) s`
  }

  /** The cohort's daily activity. Staff only (the roster guard). */
  async cohortReport(
    userId: string,
    role: string | undefined,
    cohortId: string,
    from: unknown,
    to: unknown,
    tz?: unknown
  ): Promise<CohortActivityReport> {
    await this.access.assertCohortStaff(userId, role, cohortId)
    const zone = this.zone(tz)
    return this.buildCohortReport(cohortId, this.range(from, to, zone), zone)
  }

  private async buildCohortReport(
    cohortId: string,
    range: DateRange,
    tz: string
  ): Promise<CohortActivityReport> {
    const params = [cohortId, range.from, range.to, tz]
    const inRange = `s."localDay" BETWEEN $2::date AND $3::date`
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
          activeDays: unknown
          firstSeen: Date | null
          lastSeen: Date | null
        }[]
      >(
        `SELECT s."userId" AS "userId", COALESCE(SUM(s."seconds"), 0) AS total,
                COUNT(DISTINCT s."localDay") AS "activeDays",
                MIN(s."startedAt") AS "firstSeen", MAX(s."lastSeenAt") AS "lastSeen"
           FROM ${this.sessions()}
          WHERE ${inRange}
          GROUP BY s."userId"`,
        ...params
      ),
      this.prisma.$queryRawUnsafe<{ day: string; total: unknown; learners: unknown }[]>(
        `SELECT to_char(s."localDay", 'YYYY-MM-DD') AS day, COALESCE(SUM(s."seconds"), 0) AS total,
                COUNT(DISTINCT s."userId") AS learners
           FROM ${this.sessions()}
          WHERE ${inRange}
          GROUP BY s."localDay"`,
        ...params
      ),
      this.prisma.$queryRawUnsafe<
        { itemId: string | null; title: string | null; total: unknown; learners: unknown }[]
      >(
        `SELECT s."itemId" AS "itemId", i."title" AS title, COALESCE(SUM(s."seconds"), 0) AS total,
                COUNT(DISTINCT s."userId") AS learners
           FROM ${this.sessions()} LEFT JOIN "CourseItem" i ON i."id" = s."itemId"
          WHERE ${inRange}
          GROUP BY s."itemId", i."title"
          ORDER BY COALESCE(SUM(s."seconds"), 0) DESC, title ASC`,
        ...params
      ),
    ])

    const stats = new Map(perLearner.map((r) => [r.userId, r]))
    const learners: CohortActivityLearnerRow[] = people
      // A withdrawn learner is listed only if they have time in the range.
      .filter((p) => p.status !== 'withdrawn' || stats.has(p.userId))
      .map((p) => {
        const s = stats.get(p.userId)
        const totalSeconds = num(s?.total)
        const activeDays = num(s?.activeDays)
        return {
          userId: p.userId,
          name: p.user.displayName || p.user.email || p.userId,
          totalSeconds,
          activeDays,
          averagePerActiveDaySeconds: activeDays > 0 ? Math.round(totalSeconds / activeDays) : 0,
          firstSeenAt: iso(s?.firstSeen),
          lastSeenAt: iso(s?.lastSeen),
        }
      })
      .sort((a, b) => b.totalSeconds - a.totalSeconds || a.name.localeCompare(b.name))

    const byDay = new Map(perDay.map((d) => [d.day, d]))
    const days = eachDay(range.from, range.to).map((day) => ({
      day,
      seconds: num(byDay.get(day)?.total),
      learners: num(byDay.get(day)?.learners),
    }))
    const totalSeconds = learners.reduce((n, l) => n + l.totalSeconds, 0)
    return {
      cohortId,
      from: range.from,
      to: range.to,
      tz,
      totalSeconds,
      averages: computeAverages(
        totalSeconds,
        learners,
        days.length,
        days.map((d) => d.learners)
      ),
      days,
      learners,
      items: perItem.map((r) => ({
        itemId: r.itemId,
        title: itemTitle(r),
        seconds: num(r.total),
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
    to: unknown,
    tz?: unknown
  ): Promise<LearnerActivityReport> {
    await this.access.assertCohortStaff(userId, role, cohortId)
    const zone = this.zone(tz)
    const range = this.range(from, to, zone)
    await this.access.assertLearnerOfCohort(learnerId, cohortId)
    return this.buildLearnerReport(cohortId, learnerId, range, zone)
  }

  /** The caller's own report. */
  async ownReport(
    userId: string,
    cohortId: string,
    from: unknown,
    to: unknown,
    tz?: unknown
  ): Promise<LearnerActivityReport> {
    await this.access.assertLearnerOfCohort(userId, cohortId)
    const zone = this.zone(tz)
    return this.buildLearnerReport(cohortId, userId, this.range(from, to, zone), zone)
  }

  private async buildLearnerReport(
    cohortId: string,
    learnerId: string,
    range: DateRange,
    tz: string
  ): Promise<LearnerActivityReport> {
    const [user, rows] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: learnerId },
        select: { displayName: true, email: true },
      }),
      // One learner over at most 366 days: their sessions are read one by one, oldest first.
      this.prisma.$queryRawUnsafe<
        {
          day: string
          itemId: string | null
          title: string | null
          startedAt: Date
          lastSeenAt: Date
          seconds: unknown
        }[]
      >(
        `SELECT to_char(s."localDay", 'YYYY-MM-DD') AS day, s."itemId" AS "itemId", i."title" AS title,
                s."startedAt" AS "startedAt", s."lastSeenAt" AS "lastSeenAt", s."seconds" AS seconds
           FROM ${this.sessions(true)} LEFT JOIN "CourseItem" i ON i."id" = s."itemId"
          WHERE s."localDay" BETWEEN $2::date AND $3::date
          ORDER BY s."startedAt" ASC, s."lastSeenAt" ASC`,
        cohortId,
        range.from,
        range.to,
        tz,
        learnerId
      ),
    ])
    const days = new Map<string, ActivityDay>()
    for (const r of rows) {
      const seconds = num(r.seconds)
      const startedAt = r.startedAt.toISOString()
      const lastSeenAt = r.lastSeenAt.toISOString()
      const d = days.get(r.day) ?? {
        day: r.day,
        seconds: 0,
        firstSeenAt: startedAt,
        lastSeenAt,
        sessionCount: 0,
        sessions: [],
      }
      const session: ActivitySessionRow = {
        startedAt,
        seconds,
        itemId: r.itemId,
        title: itemTitle(r),
      }
      d.seconds += seconds
      d.sessionCount += 1
      if (startedAt < d.firstSeenAt) d.firstSeenAt = startedAt
      if (lastSeenAt > d.lastSeenAt) d.lastSeenAt = lastSeenAt
      d.sessions.push(session)
      days.set(r.day, d)
    }
    const list = [...days.values()].sort((a, b) => a.day.localeCompare(b.day))
    const totalSeconds = list.reduce((n, d) => n + d.seconds, 0)
    return {
      cohortId,
      userId: learnerId,
      name: user?.displayName || user?.email || learnerId,
      from: range.from,
      to: range.to,
      tz,
      totalSeconds,
      activeDays: list.length,
      averagePerActiveDaySeconds: list.length > 0 ? Math.round(totalSeconds / list.length) : 0,
      days: list,
    }
  }

  /** One row per session (a start and the minutes on one activity), for download. Staff only. */
  async cohortCsv(
    userId: string,
    role: string | undefined,
    cohortId: string,
    from: unknown,
    to: unknown,
    tz?: unknown
  ): Promise<string> {
    await this.access.assertCohortStaff(userId, role, cohortId)
    const zone = this.zone(tz)
    const range = this.range(from, to, zone)
    const rows = await this.prisma.$queryRawUnsafe<
      {
        name: string | null
        email: string | null
        day: string
        itemId: string | null
        title: string | null
        startedAt: Date
        seconds: unknown
      }[]
    >(
      `SELECT u."displayName" AS name, u."email" AS email, to_char(s."localDay", 'YYYY-MM-DD') AS day,
              s."itemId" AS "itemId", i."title" AS title, s."startedAt" AS "startedAt",
              s."seconds" AS seconds
         FROM ${this.sessions()}
         JOIN "User" u ON u."id" = s."userId"
         LEFT JOIN "CourseItem" i ON i."id" = s."itemId"
        WHERE s."localDay" BETWEEN $2::date AND $3::date
        ORDER BY COALESCE(u."displayName", u."email", u."id") ASC, s."startedAt" ASC
        LIMIT ${MAX_CSV_ROWS + 1}`,
      cohortId,
      range.from,
      range.to,
      zone
    )
    if (rows.length > MAX_CSV_ROWS)
      throw new PayloadTooLargeException(
        `This export has more than ${MAX_CSV_ROWS.toLocaleString('en-US')} rows. Choose a shorter date range and export again.`
      )
    const csv: CsvRow[] = rows.map((r) => ({
      name: r.name || r.email || '',
      email: r.email,
      startedAt: r.startedAt,
      dateLocal: r.day,
      item: itemTitle(r),
      seconds: num(r.seconds),
    }))
    return activityCsv(csv)
  }
}
