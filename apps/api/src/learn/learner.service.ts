import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  InterviewAttempt,
  KnowledgeCheckQuestion,
  LearnerAddedItem,
  LearnerCohortCard,
  LearnerItem,
  ToolAttempt,
  LearnerOutline,
  LearnerOutlineItem,
  PlanAddition,
  ProgressStatus,
  QuizResult,
  ReadinessRecord,
} from './learn-types'
import { ClerkService } from '../auth/clerk.service'
import { PrismaService } from '../prisma/prisma.service'
import { cohortStatus } from './cohort-config'
import { gradeQuiz, publicQuestions } from './grade-quiz'
import { averageScore, DEFAULT_ATTEMPTS, MAX_ANSWER_CHARS } from './interview-scoring'
import { InterviewScoringService } from './interview-scoring.service'
import { parseExternalLink } from './external-link'
import {
  assessmentLimits,
  isInterviewLike,
  passScoreOf,
  scopeOf,
  toolAllowedFor,
  isPracticeItem,
  toolAnyById,
  toolById,
} from '../lti/platform/lti-platform-config'
import { imageUrl, isImageKey } from './item-image'
import { isSupportedItemType } from './course-config'
import { doneSince, parseSkills, remediationOf, reviewOf, skillResults } from './skills'
import { isVideoId, VIDEO_COMPLETE_PCT } from './youtube'
import { randomUUID } from 'node:crypto'

/** A tool's score is still accepted this long after the cohort ends (a timed assessment begun just before). */
export const TOOL_SCORE_GRACE_MS = 24 * 60 * 60 * 1000
/** How many recent `reportedAt` values are kept to recognise a repeated report. */
const RECENT_REPORTS_KEPT = 10
const ATTEMPT_LOG_MAX = 50

/** Whether this exact report (by its timestamp) is already recorded in a tool item's progress data. */
export function alreadyReported(data: unknown, reportedAt: string): boolean {
  const d = (data ?? {}) as { reportedAt?: unknown; recentReportedAt?: unknown }
  return (
    d.reportedAt === reportedAt ||
    (Array.isArray(d.recentReportedAt) && d.recentReportedAt.includes(reportedAt))
  )
}

/**
 * Records one tool score in a single statement, so concurrent reports cannot lose each other.
 * $1 new row id, $2 enrollment, $3 item, $4 score, $5 data (json: lastScore, at, reportedAt?,
 * dimensions?), $6 reportedAt (text or null), $7 attempt cap (int or null for none),
 * $8 pass mark (int or null: any score passes), $9 new ItemAttempt row id. A score below it leaves the item in progress; once
 * an attempt has passed, the item stays completed.
 * The ON CONFLICT branch runs on the row's latest committed version (row-locked), and its WHERE
 * skips the update, returning no row, when the report is a repeat (same reportedAt) or the cap
 * is reached. Score is the best seen; dimensions stay those of the best attempt.
 * The attempt log row (#67) is inserted from the upsert's RETURNING in the same statement, so it
 * exists exactly when the counter moved: a skipped report returns no row and logs nothing.
 */
export const RECORD_TOOL_RESULT_SQL = `
WITH counted AS (
INSERT INTO "ItemProgress" AS ip
  ("id", "enrollmentId", "itemId", "status", "score", "attempts", "completedAt", "data", "updatedAt")
VALUES (
  $1, $2, $3,
  CASE WHEN $4::int >= COALESCE($8::int, 0) THEN 'completed' ELSE 'in_progress' END,
  $4::int, 1,
  CASE WHEN $4::int >= COALESCE($8::int, 0) THEN now() AT TIME ZONE 'UTC' END,
  CASE WHEN $6::text IS NULL THEN $5::jsonb
       ELSE $5::jsonb || jsonb_build_object('recentReportedAt', jsonb_build_array($6::text)) END,
  now() AT TIME ZONE 'UTC'
)
ON CONFLICT ("enrollmentId", "itemId") DO UPDATE SET
  "status" = CASE WHEN ip."status" = 'completed' OR EXCLUDED."score" >= COALESCE($8::int, 0)
                  THEN 'completed' ELSE 'in_progress' END,
  "score" = GREATEST(ip."score", EXCLUDED."score"),
  "attempts" = ip."attempts" + 1,
  "completedAt" = CASE WHEN ip."status" = 'completed' AND EXCLUDED."score" < COALESCE($8::int, 0)
                       THEN ip."completedAt"
                       WHEN EXCLUDED."score" >= COALESCE($8::int, 0)
                       THEN now() AT TIME ZONE 'UTC'
                       ELSE ip."completedAt" END,
  "updatedAt" = now() AT TIME ZONE 'UTC',
  "data" = (
    CASE WHEN EXCLUDED."score" > COALESCE(ip."score", -1)
         THEN (COALESCE(ip."data", '{}'::jsonb) - 'dimensions')
              || (EXCLUDED."data" - 'recentReportedAt')
         ELSE COALESCE(ip."data", '{}'::jsonb)
              || (EXCLUDED."data" - 'recentReportedAt' - 'dimensions')
    END
  ) || jsonb_build_object('recentReportedAt', (
    SELECT COALESCE(jsonb_agg(t.v ORDER BY t.n), '[]'::jsonb)
    FROM (
      SELECT a.v, a.n
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(ip."data"->'recentReportedAt') = 'array' THEN ip."data"->'recentReportedAt'
             WHEN ip."data"->>'reportedAt' IS NOT NULL THEN jsonb_build_array(ip."data"->>'reportedAt')
             ELSE '[]'::jsonb END
        || CASE WHEN $6::text IS NULL THEN '[]'::jsonb ELSE jsonb_build_array($6::text) END
      ) WITH ORDINALITY AS a(v, n)
      ORDER BY a.n DESC
      LIMIT ${RECENT_REPORTS_KEPT}
    ) t
  ))
WHERE ($7::int IS NULL OR ip."attempts" < $7::int)
  AND ($6::text IS NULL OR (
        NOT (COALESCE(ip."data"->'recentReportedAt', '[]'::jsonb) @> to_jsonb($6::text))
        AND COALESCE(ip."data"->>'reportedAt', '') <> $6::text))
RETURNING ip."attempts" AS "attempts"
), logged AS (
  INSERT INTO "ItemAttempt" ("id", "enrollmentId", "itemId", "score", "reportedAt", "dimensions")
  SELECT $9, $2, $3, $4::int, ($6::timestamptz AT TIME ZONE 'UTC'), ($5::jsonb)->'dimensions'
  FROM counted
)
SELECT "attempts" FROM counted
`

/**
 * Done for what the learner is doing now: completed, and for an item their results
 * added to the plan, completed again since it was added (a review means doing it again).
 */
const isDoneNow = (
  progress: { status: string; completedAt: Date | null } | null | undefined,
  plan: { createdAt: Date } | null | undefined
): boolean => progress?.status === 'completed' && (!plan || doneSince(progress, plan.createdAt))

interface ProgressLite {
  itemId: string
  status: string
  score: number | null
  attempts: number
}

/** The learner's own side: join a cohort, work through its course, see their record. */
@Injectable()
export class LearnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clerk: ClerkService,
    private readonly scoring: InterviewScoringService
  ) {}

  // ── joining ───────────────────────────────────────────────────────────────

  /** The User row mirrors the Clerk user; it is created the first time someone joins. */
  private async ensureUser(userId: string): Promise<void> {
    if (await this.prisma.user.findUnique({ where: { id: userId } })) return
    const profile = await this.clerk.getUserProfile(userId, 'learn')
    try {
      await this.prisma.user.create({
        data: {
          id: userId,
          source: 'learn',
          email: profile?.email ?? null,
          displayName: profile?.displayName ?? null,
        },
      })
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err
      // Email already taken by another row: keep the account, drop the cached email.
      await this.prisma.user.create({
        data: { id: userId, source: 'learn', displayName: profile?.displayName ?? null },
      })
    }
  }

  async join(userId: string, code: unknown): Promise<LearnerCohortCard> {
    const key = typeof code === 'string' ? code.trim() : ''
    if (!key) throw new NotFoundException('Enter a join code')
    const cohort = await this.prisma.cohort.findFirst({
      where: { joinKey: { equals: key, mode: 'insensitive' }, courseId: { not: null } },
      include: {
        institution: { select: { id: true, name: true } },
        course: { select: { id: true } },
      },
    })
    if (!cohort)
      throw new NotFoundException('That code does not match a cohort. Check it and try again.')
    if (cohortStatus(cohort.startsAt, cohort.endsAt) === 'completed') {
      throw new ConflictException('That cohort has already ended.')
    }
    await this.ensureUser(userId)
    const existing = await this.prisma.enrollment.findUnique({
      where: { cohortId_userId: { cohortId: cohort.id, userId } },
    })
    // A seat is needed unless this person already holds one.
    if (typeof cohort.maxLearners === 'number' && (!existing || existing.status === 'withdrawn')) {
      const taken = await this.prisma.enrollment.count({
        where: { cohortId: cohort.id, status: { not: 'withdrawn' } },
      })
      if (taken >= cohort.maxLearners) throw new ConflictException('This cohort is full.')
    }
    if (existing && existing.status === 'withdrawn') {
      await this.prisma.enrollment.update({
        where: { id: existing.id },
        data: { status: 'enrolled' },
      })
    } else if (!existing) {
      await this.prisma.enrollment.create({ data: { cohortId: cohort.id, userId } })
    }
    await this.prisma.membership.upsert({
      where: {
        userId_institutionId_cohortId: {
          userId,
          institutionId: cohort.institution.id,
          cohortId: cohort.id,
        },
      },
      create: { userId, institutionId: cohort.institution.id, cohortId: cohort.id },
      update: {},
    })
    return (await this.cards(userId)).find((c) => c.cohortId === cohort.id) as LearnerCohortCard
  }

  // ── reading ───────────────────────────────────────────────────────────────

  /** The tool a course item names, or undefined when it is off or not available to this course's provider. */
  private async toolFor(courseId: string, toolId: unknown) {
    const tool = toolById(toolId)
    if (!tool || tool.workspaceIds.length === 0) return tool
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { provider: { select: { id: true, parentId: true } } },
    })
    return course && toolAllowedFor(tool, scopeOf(course.provider)) ? tool : undefined
  }

  private async courseItems(courseId: string) {
    const modules = await this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: { position: 'asc' },
      include: { items: { orderBy: { position: 'asc' } } },
    })
    // A stored item of a type that is no longer supported is skipped, not shown broken.
    return modules.map((m) => ({ ...m, items: m.items.filter((i) => isSupportedItemType(i.type)) }))
  }

  async cards(userId: string): Promise<LearnerCohortCard[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { userId, status: { not: 'withdrawn' }, cohort: { courseId: { not: null } } },
      include: {
        cohort: {
          include: {
            institution: { select: { name: true } },
            course: { select: { id: true, title: true } },
          },
        },
        progress: { where: { status: 'completed' }, select: { itemId: true } },
        plan: { select: { itemId: true } },
      },
      orderBy: { enrolledAt: 'desc' },
    })
    const totals = new Map<string, number>()
    for (const r of rows) {
      const cid = r.cohort.course?.id as string
      if (!totals.has(cid)) {
        const modules = await this.courseItems(cid)
        totals.set(
          cid,
          modules.reduce((n, m) => n + m.items.filter((i) => !remediationOf(i.config)).length, 0)
        )
      }
    }
    return rows.map((r) => ({
      cohortId: r.cohortId,
      cohortName: r.cohort.name,
      courseTitle: r.cohort.course?.title as string,
      host: r.cohort.institution.name,
      status: cohortStatus(r.cohort.startsAt, r.cohort.endsAt),
      startsAt: r.cohort.startsAt?.toISOString() ?? null,
      endsAt: r.cohort.endsAt?.toISOString() ?? null,
      enrollmentStatus: r.status as LearnerCohortCard['enrollmentStatus'],
      itemsDone: r.progress.length,
      itemsTotal: (totals.get(r.cohort.course?.id as string) ?? 0) + r.plan.length,
    }))
  }

  /** The learner's enrollment in this cohort, with the cohort and its course. */
  private async enrollmentFor(userId: string, cohortId: string) {
    const e = await this.prisma.enrollment.findUnique({
      where: { cohortId_userId: { cohortId, userId } },
      include: {
        cohort: {
          include: {
            institution: { select: { name: true } },
            course: true,
          },
        },
      },
    })
    if (!e || e.status === 'withdrawn' || !e.cohort.course) {
      throw new NotFoundException('You are not in this cohort')
    }
    return { ...e, cohort: { ...e.cohort, course: e.cohort.course } }
  }

  private statusOf(p: ProgressLite | undefined): ProgressStatus {
    return (p?.status as ProgressStatus | undefined) ?? 'not_started'
  }

  async outline(userId: string, cohortId: string): Promise<LearnerOutline> {
    const e = await this.enrollmentFor(userId, cohortId)
    const course = e.cohort.course
    const [modules, progress, plan] = await Promise.all([
      this.courseItems(course.id),
      this.prisma.itemProgress.findMany({ where: { enrollmentId: e.id } }),
      this.prisma.planItem.findMany({
        where: { enrollmentId: e.id },
        orderBy: { createdAt: 'asc' },
      }),
    ])
    const byItem = new Map(progress.map((p) => [p.itemId, p]))
    const allItems = modules.flatMap((m) => m.items)
    // Remediation items are in the outline only for learners whose plan includes them.
    const items = allItems.filter((i) => !remediationOf(i.config))
    const addedItems = plan.flatMap((p): LearnerAddedItem[] => {
      const i = allItems.find((x) => x.id === p.itemId)
      const r = (p.reason ?? {}) as {
        skillLabel?: string
        pct?: number
        n?: number
        sourceItemId?: string | null
      }
      if (!i) return []
      return [
        {
          id: i.id,
          type: i.type,
          title: i.title,
          label: i.label,
          // Done for the plan only if completed since it was added: a review means doing it again.
          status: doneSince(byItem.get(i.id), p.createdAt)
            ? ('completed' as const)
            : ('not_started' as const),
          score: byItem.get(i.id)?.score ?? null,
          attempts: byItem.get(i.id)?.attempts ?? 0,
          reason: {
            skill: r.skillLabel ?? '',
            pct: r.pct ?? 0,
            n: r.n ?? 0,
            sourceItemId: r.sourceItemId ?? null,
          },
          review: !remediationOf(i.config),
        },
      ]
    })
    const done =
      items.filter((i) => byItem.get(i.id)?.status === 'completed').length +
      addedItems.filter((i) => i.status === 'completed').length
    return {
      cohort: {
        cohortId,
        cohortName: e.cohort.name,
        courseTitle: course.title,
        host: e.cohort.institution.name,
        status: cohortStatus(e.cohort.startsAt, e.cohort.endsAt),
        startsAt: e.cohort.startsAt?.toISOString() ?? null,
        endsAt: e.cohort.endsAt?.toISOString() ?? null,
        enrollmentStatus: e.status as LearnerCohortCard['enrollmentStatus'],
        itemsDone: done,
        itemsTotal: items.length + addedItems.length,
      },
      added: addedItems,
      modules: modules.map((m) => ({
        id: m.id,
        title: m.title,
        items: m.items
          .filter((i) => !remediationOf(i.config))
          .map(
            (i): LearnerOutlineItem => ({
              id: i.id,
              type: i.type,
              title: i.title,
              label: i.label,
              status: this.statusOf(byItem.get(i.id)),
              score: byItem.get(i.id)?.score ?? null,
              attempts: byItem.get(i.id)?.attempts ?? 0,
            })
          ),
      })),
      record: buildRecord(
        items.map((i) => ({
          id: i.id,
          type: i.type,
          label: i.label,
          config: i.config,
        })),
        progress,
        course,
        e.status === 'completed'
      ),
    }
  }

  // ── doing ─────────────────────────────────────────────────────────────────

  private lockReason(startsAt: Date | null, endsAt: Date | null): string | null {
    const s = cohortStatus(startsAt, endsAt)
    if (s === 'upcoming') return 'This cohort has not started yet.'
    if (s === 'completed') return 'This cohort has ended.'
    return null
  }

  private async itemOf(userId: string, cohortId: string, itemId: string) {
    const e = await this.enrollmentFor(userId, cohortId)
    const item = await this.prisma.courseItem.findUnique({
      where: { id: itemId },
      include: { module: { select: { courseId: true } } },
    })
    if (!item || item.module.courseId !== e.cohort.course.id)
      throw new NotFoundException('Item not found')
    if (!isSupportedItemType(item.type))
      throw new NotFoundException('This item type is no longer supported')
    // The plan entry, if this learner's results added the item. Extra content opens only with one.
    const plan = await this.prisma.planItem.findUnique({
      where: { enrollmentId_itemId: { enrollmentId: e.id, itemId } },
    })
    if (remediationOf(item.config) && !plan) throw new NotFoundException('Item not found')
    const progress = await this.prisma.itemProgress.findUnique({
      where: { enrollmentId_itemId: { enrollmentId: e.id, itemId } },
    })
    return { e, item, progress, plan }
  }

  /** A tool item's attempt log (newest first, at most 50) and how many counted attempts predate it. */
  async attemptLogOf(
    enrollmentId: string,
    item: { id: string; label: string | null; config: unknown },
    attempts: number,
    bestScore: number | null
  ): Promise<{ attemptLog: ToolAttempt[]; attemptsBeforeLog: number }> {
    const rows = await this.prisma.itemAttempt.findMany({
      where: { enrollmentId, itemId: item.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ATTEMPT_LOG_MAX,
      select: { score: true, createdAt: true },
    })
    // Only a full page can hide more rows; "not recorded" means counted before the log existed.
    const logged =
      rows.length < ATTEMPT_LOG_MAX
        ? rows.length
        : await this.prisma.itemAttempt.count({ where: { enrollmentId, itemId: item.id } })
    const pass = passScoreOf(item.config, item.label)
    // The chip goes on the attempt that IS the item's best score (the earliest one on a tie). When
    // the best was made before the log existed, no listed attempt is it, so none gets the chip.
    let bestAt = -1
    for (let i = rows.length - 1; i >= 0; i--)
      if (rows[i].score === bestScore) {
        bestAt = i
        break
      }
    return {
      attemptLog: rows.map((r, i) => ({
        score: r.score,
        at: r.createdAt.toISOString(),
        best: i === bestAt,
        passed: pass === null ? null : r.score >= pass,
      })),
      attemptsBeforeLog: Math.max(0, attempts - logged),
    }
  }

  async item(
    userId: string,
    cohortId: string,
    itemId: string,
    planAdded: PlanAddition[] = []
  ): Promise<LearnerItem> {
    const { e, item, progress, plan } = await this.itemOf(userId, cohortId, itemId)
    const config = (item.config ?? {}) as Record<string, unknown>
    let interview: LearnerItem['interview'] = null
    if (item.type === 'interview') {
      const saved = (progress?.data ?? null) as { attempts?: InterviewAttempt[] } | null
      interview = {
        role: typeof config.role === 'string' ? config.role : '',
        questions: Array.isArray(config.questions) ? config.questions.map(String) : [],
        maxAttempts: attemptsAllowed(config),
        attempts: saved?.attempts ?? [],
      }
    }
    let scorm: LearnerItem['scorm'] = null
    if (
      item.type === 'scorm' &&
      typeof config.packageId === 'string' &&
      typeof config.entry === 'string'
    ) {
      scorm = {
        src: scormSrc(config.packageId, config.entry),
        version: config.version === '2004' ? '2004' : '1.2',
        cmi: (progress?.data ?? null) as Record<string, unknown> | null,
      }
    }
    let video: LearnerItem['video'] = null
    if (item.type === 'video' && isVideoId(config.videoId)) {
      video = {
        videoId: config.videoId,
        startSeconds: typeof config.startSeconds === 'number' ? config.startSeconds : null,
        minWatchedPct: VIDEO_COMPLETE_PCT,
      }
    }
    // Course content a flagged skill sent the learner back to: done before, but it must be done again.
    const why = ((plan?.reason ?? {}) as { skillLabel?: string; pct?: number }) || {}
    const review: LearnerItem['review'] =
      plan && progress?.status === 'completed' && !doneSince(progress, plan.createdAt)
        ? { skill: why.skillLabel ?? '', pct: why.pct ?? 0 }
        : null
    let link: LearnerItem['link'] = null
    const parsed = item.type === 'external_link' ? parseExternalLink(config.url) : null
    if (parsed) {
      link = {
        url: parsed.url,
        host: parsed.host,
        summary: typeof config.summary === 'string' ? config.summary : null,
        instructions: typeof config.instructions === 'string' ? config.instructions : null,
        imageUrl: isImageKey(config.imageKey) ? imageUrl(config.imageKey) : null,
      }
    }
    const registered =
      item.type === 'tool' ? await this.toolFor(e.cohort.course.id, config.toolId) : undefined
    const limits = registered?.kind === 'assessment' ? assessmentLimits(config) : null
    const tool: LearnerItem['tool'] =
      registered && typeof config.ref === 'string'
        ? {
            toolId: registered.toolId,
            name: registered.name,
            ref: config.ref,
            // Interviews are unlimited; an assessment allows `maxAttempts` recorded scores.
            retries: limits ? (progress?.attempts ?? 0) < limits.maxAttempts : true,
            attemptsAllowed: limits ? limits.maxAttempts : null,
            timeLimitMinutes: limits ? limits.timeLimitMinutes : null,
            passScore: passScoreOf(config, item.label),
            optional: isPracticeItem(item),
          }
        : null
    const log =
      item.type === 'tool'
        ? await this.attemptLogOf(e.id, item, progress?.attempts ?? 0, progress?.score ?? null)
        : { attemptLog: [], attemptsBeforeLog: 0 }
    return {
      id: item.id,
      cohortId,
      type: item.type,
      title: item.title,
      label: item.label,
      body: item.type === 'lesson' ? String(config.body ?? '') : null,
      questions:
        item.type === 'knowledge_check'
          ? publicQuestions((config.questions ?? []) as KnowledgeCheckQuestion[])
          : null,
      scorm,
      interview,
      planAdded,
      review,
      video,
      link,
      tool,
      status: review ? 'not_started' : this.statusOf(progress ?? undefined),
      score: progress?.score ?? null,
      attempts: progress?.attempts ?? 0,
      ...log,
      locked: this.lockReason(e.cohort.startsAt, e.cohort.endsAt),
    }
  }

  async completeLesson(userId: string, cohortId: string, itemId: string): Promise<LearnerItem> {
    const { e, item, progress, plan } = await this.itemOf(userId, cohortId, itemId)
    const locked = this.lockReason(e.cohort.startsAt, e.cohort.endsAt)
    if (locked) throw new ConflictException(locked)
    if (item.type !== 'lesson') throw new ConflictException('Only lessons are marked done this way')
    if (!isDoneNow(progress, plan)) {
      await this.prisma.itemProgress.upsert({
        where: { enrollmentId_itemId: { enrollmentId: e.id, itemId } },
        create: {
          enrollmentId: e.id,
          itemId,
          status: 'completed',
          attempts: 1,
          completedAt: new Date(),
        },
        update: { status: 'completed', attempts: { increment: 1 }, completedAt: new Date() },
      })
      await this.completeIfDone(e.id, e.status, e.cohort.course.id)
    }
    return this.item(userId, cohortId, itemId)
  }

  /**
   * Marks a video done. The player reports how much was watched; it is the
   * learner's browser saying so, so what is kept is labelled with the evidence:
   * 'player-verified' (the player counted the watching) or 'self-attested' (the
   * video would not play and the learner said they watched it).
   */
  async completeVideo(
    userId: string,
    cohortId: string,
    itemId: string,
    body: unknown
  ): Promise<LearnerItem> {
    return this.completeAttested(userId, cohortId, itemId, 'video', videoEvidence(body))
  }

  /** Marks a link to an external course done, on the learner's word. */
  async completeExternal(userId: string, cohortId: string, itemId: string): Promise<LearnerItem> {
    return this.completeAttested(userId, cohortId, itemId, 'external_link', {
      evidence: 'self-attested',
    })
  }

  /** Completion without a score, for items whose proof is the evidence label kept with it. */
  private async completeAttested(
    userId: string,
    cohortId: string,
    itemId: string,
    type: 'video' | 'external_link',
    evidence: { evidence: string; watchedPct?: number }
  ): Promise<LearnerItem> {
    const { e, item, progress, plan } = await this.itemOf(userId, cohortId, itemId)
    const locked = this.lockReason(e.cohort.startsAt, e.cohort.endsAt)
    if (locked) throw new ConflictException(locked)
    if (item.type !== type)
      throw new ConflictException(`This item is not a ${type.replace('_', ' ')}`)
    if (!isDoneNow(progress, plan)) {
      const data = { ...evidence, attestedAt: new Date().toISOString() }
      await this.prisma.itemProgress.upsert({
        where: { enrollmentId_itemId: { enrollmentId: e.id, itemId } },
        create: {
          enrollmentId: e.id,
          itemId,
          status: 'completed',
          attempts: 1,
          completedAt: new Date(),
          data,
        },
        update: {
          status: 'completed',
          attempts: { increment: 1 },
          completedAt: new Date(),
          data,
        },
      })
      await this.completeIfDone(e.id, e.status, e.cohort.course.id)
    }
    return this.item(userId, cohortId, itemId)
  }

  async submitQuiz(
    userId: string,
    cohortId: string,
    itemId: string,
    answers: unknown
  ): Promise<{ result: QuizResult; item: LearnerItem }> {
    const { e, item, progress } = await this.itemOf(userId, cohortId, itemId)
    const locked = this.lockReason(e.cohort.startsAt, e.cohort.endsAt)
    if (locked) throw new ConflictException(locked)
    if (item.type !== 'knowledge_check') throw new ConflictException('This item has no questions')
    const questions =
      ((item.config ?? {}) as { questions?: KnowledgeCheckQuestion[] }).questions ?? []
    const result = gradeQuiz(questions, answers)
    const best = Math.max(result.score, progress?.score ?? 0)
    // Per-question results, so a weak skill can be found later (the latest attempt replaces the last).
    const data = {
      results: questions.map((q, i) => ({ id: q.id ?? `q${i}`, correct: result.correct[i] })),
    }
    await this.prisma.itemProgress.upsert({
      where: { enrollmentId_itemId: { enrollmentId: e.id, itemId } },
      create: {
        enrollmentId: e.id,
        itemId,
        status: 'completed',
        score: result.score,
        attempts: 1,
        completedAt: new Date(),
        data,
      },
      update: {
        status: 'completed',
        score: best,
        attempts: { increment: 1 },
        completedAt: new Date(),
        data,
      },
    })
    // Plan first, so a skill flagged by the last quiz holds the course open.
    const added = await this.updatePlan(e.id, e.cohort.course, itemId)
    await this.completeIfDone(e.id, e.status, e.cohort.course.id)
    return { result, item: await this.item(userId, cohortId, itemId, added) }
  }

  /**
   * Scores typed answers to a practice interview. Up to three attempts; the best
   * counts toward the readiness record. A failed scoring call uses no attempt.
   */
  async submitInterview(
    userId: string,
    cohortId: string,
    itemId: string,
    answers: unknown
  ): Promise<LearnerItem> {
    const { e, item, progress } = await this.itemOf(userId, cohortId, itemId)
    const locked = this.lockReason(e.cohort.startsAt, e.cohort.endsAt)
    if (locked) throw new ConflictException(locked)
    if (item.type !== 'interview')
      throw new ConflictException('This item is not a practice interview')
    const config = (item.config ?? {}) as {
      role?: string
      questions?: unknown
      maxAttempts?: unknown
    }
    const questions = Array.isArray(config.questions) ? config.questions.map(String) : []
    if (questions.length === 0) throw new ConflictException('This interview has no questions yet')
    const allowed = attemptsAllowed(config)
    if ((progress?.attempts ?? 0) >= allowed) {
      throw new ConflictException(`You have used all ${allowed} attempts.`)
    }
    if (!Array.isArray(answers) || answers.length !== questions.length) {
      throw new BadRequestException('Answer every question')
    }
    const typed = answers.map((a) => (typeof a === 'string' ? a.trim() : ''))
    if (typed.some((a) => !a)) throw new BadRequestException('Answer every question')
    if (typed.some((a) => a.length > MAX_ANSWER_CHARS)) {
      throw new BadRequestException(`Keep each answer under ${MAX_ANSWER_CHARS} characters`)
    }

    const results = await this.scoring.score(config.role ?? '', questions, typed)
    const overall = averageScore(results)
    const attempt: InterviewAttempt = {
      score: overall,
      at: new Date().toISOString(),
      answers: results,
    }
    const earlier =
      ((progress?.data ?? null) as { attempts?: InterviewAttempt[] } | null)?.attempts ?? []
    const best = Math.max(overall, progress?.score ?? 0)
    await this.prisma.itemProgress.upsert({
      where: { enrollmentId_itemId: { enrollmentId: e.id, itemId } },
      create: {
        enrollmentId: e.id,
        itemId,
        status: 'completed',
        score: best,
        attempts: 1,
        completedAt: new Date(),
        data: { attempts: [attempt] } as unknown as object,
      },
      update: {
        status: 'completed',
        score: best,
        attempts: { increment: 1 },
        completedAt: new Date(),
        data: { attempts: [...earlier, attempt].slice(-allowed) } as unknown as object,
      },
    })
    const added = await this.updatePlan(e.id, e.cohort.course, itemId)
    return this.item(userId, cohortId, itemId, added)
  }

  /**
   * Records a score an LTI tool sent back (0-100): the best counts, every distinct report is an
   * attempt, and the plan and course completion are updated like after any other scored item.
   * The write is one SQL statement, so concurrent reports neither lose an attempt nor a better score.
   */
  async recordToolResult(
    userId: string,
    cohortId: string,
    itemId: string,
    result: { scorePct: number; dimensions?: unknown; reportedAt?: string }
  ): Promise<LearnerItem> {
    const { e, item, progress } = await this.itemOf(userId, cohortId, itemId)
    // Launching needs an open cohort; a score may arrive up to a day after it closes, so a learner
    // who started a timed assessment just before the end keeps the result.
    const status = cohortStatus(e.cohort.startsAt, e.cohort.endsAt)
    if (status === 'upcoming') throw new ConflictException('This cohort has not started yet.')
    if (
      status === 'completed' &&
      Date.now() - (e.cohort.endsAt as Date).getTime() > TOOL_SCORE_GRACE_MS
    )
      throw new ConflictException('This cohort has ended.')
    if (item.type !== 'tool') throw new ConflictException('This item is not a connected tool')
    const pct = result.scorePct
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100)
      throw new BadRequestException('Score must be from 0 to 100')
    // Any state: an attempt cap still applies to a tool switched off since the learner launched it.
    const registered = toolAnyById((item.config as { toolId?: unknown } | null)?.toolId)
    const cap = registered?.kind === 'assessment' ? assessmentLimits(item.config).maxAttempts : null

    // A tool may report the same result twice (a retry after a timeout): a report with the same
    // timestamp as one already recorded is not counted again.
    const reportedMs = typeof result.reportedAt === 'string' ? Date.parse(result.reportedAt) : NaN
    const reportedAt = Number.isNaN(reportedMs) ? null : new Date(reportedMs).toISOString()
    // The statement below re-checks both rules on the row's latest state; this saves a round trip.
    if (reportedAt && progress && alreadyReported(progress.data, reportedAt))
      return this.item(userId, cohortId, itemId)
    if (cap !== null && (progress?.attempts ?? 0) >= cap)
      throw new ConflictException(`You have used all ${cap} attempts.`)

    const score = Math.round(pct)
    const dims = result.dimensions
    const data = {
      lastScore: score,
      at: new Date().toISOString(),
      ...(reportedAt ? { reportedAt } : {}),
      ...(dims && typeof dims === 'object' && JSON.stringify(dims).length < 20_000
        ? { dimensions: dims }
        : {}),
    }
    const rows = await this.prisma.$queryRawUnsafe<{ attempts: number }[]>(
      RECORD_TOOL_RESULT_SQL,
      randomUUID(),
      e.id,
      itemId,
      score,
      JSON.stringify(data),
      reportedAt,
      cap,
      passScoreOf(item.config, item.label),
      randomUUID()
    )
    if (rows.length === 0) {
      // Another request got there first: it was this very report, or it used the last attempt.
      const now = await this.prisma.itemProgress.findUnique({
        where: { enrollmentId_itemId: { enrollmentId: e.id, itemId } },
      })
      if (reportedAt && now && alreadyReported(now.data, reportedAt))
        return this.item(userId, cohortId, itemId)
      throw new ConflictException(`You have used all ${cap} attempts.`)
    }
    // Plan first, so a skill flagged by this result holds the course open.
    const added = await this.updatePlan(e.id, e.cohort.course, itemId)
    await this.completeIfDone(e.id, e.status, e.cohort.course.id)
    return this.item(userId, cohortId, itemId, added)
  }

  /** Saves what a SCORM package reported: status, score and the data it needs to resume. */
  async saveScorm(
    userId: string,
    cohortId: string,
    itemId: string,
    body: unknown
  ): Promise<LearnerItem> {
    const { e, item, progress, plan } = await this.itemOf(userId, cohortId, itemId)
    const locked = this.lockReason(e.cohort.startsAt, e.cohort.endsAt)
    if (locked) throw new ConflictException(locked)
    if (item.type !== 'scorm') throw new ConflictException('This item is not a SCORM package')
    const { done, score } = scormResult(body)
    const raw = (body as { runtimeData?: unknown } | null)?.runtimeData
    const runtime =
      raw && typeof raw === 'object' && !Array.isArray(raw) && JSON.stringify(raw).length < 400_000
        ? (raw as object)
        : undefined
    const everDone = progress?.status === 'completed'
    const wasDone = isDoneNow(progress, plan)
    const best = score === null ? (progress?.score ?? null) : Math.max(score, progress?.score ?? 0)
    await this.prisma.itemProgress.upsert({
      where: { enrollmentId_itemId: { enrollmentId: e.id, itemId } },
      create: {
        enrollmentId: e.id,
        itemId,
        status: done ? 'completed' : 'in_progress',
        score: best,
        attempts: 1,
        completedAt: done ? new Date() : null,
        data: runtime,
      },
      update: {
        status: done || everDone ? 'completed' : 'in_progress',
        score: best,
        ...(done && !wasDone ? { completedAt: new Date() } : {}),
        ...(runtime ? { data: runtime } : {}),
      },
    })
    if (done) await this.completeIfDone(e.id, e.status, e.cohort.course.id)
    return this.item(userId, cohortId, itemId)
  }

  /**
   * Adds the author's remediation content for every skill the learner is now
   * flagged on. Only ever adds, once per item, so it can run after every scored
   * attempt. Returns what was newly added, for the result screen.
   */
  private async updatePlan(
    enrollmentId: string,
    course: { id: string; skills: unknown },
    sourceItemId: string
  ): Promise<PlanAddition[]> {
    const skills = parseSkills(course.skills)
    if (skills.length === 0) return []
    const [modules, progress, existing] = await Promise.all([
      this.courseItems(course.id),
      this.prisma.itemProgress.findMany({ where: { enrollmentId } }),
      this.prisma.planItem.findMany({ where: { enrollmentId }, select: { itemId: true } }),
    ])
    const items = modules.flatMap((m) => m.items)
    const have = new Set(existing.map((p) => p.itemId))
    const results = skillResults(skills, items, new Map(progress.map((p) => [p.itemId, p])))
    const rows: { enrollmentId: string; itemId: string; reason: object }[] = []
    const added: PlanAddition[] = []
    for (const r of results.filter((x) => x.status === 'gap')) {
      for (const item of items) {
        const extra = remediationOf(item.config) === r.skillId
        const review = reviewOf(item.config) === r.skillId
        if ((!extra && !review) || have.has(item.id)) continue
        have.add(item.id)
        const pct = r.pct as number
        rows.push({
          enrollmentId,
          itemId: item.id,
          reason: { skill: r.skillId, skillLabel: r.label, pct, n: r.n, sourceItemId },
        })
        added.push({
          itemId: item.id,
          type: item.type,
          title: item.title,
          skill: r.label,
          pct,
          n: r.n,
          review,
        })
      }
    }
    if (rows.length > 0) await this.prisma.planItem.createMany({ data: rows, skipDuplicates: true })
    return added
  }

  /**
   * Whether the learner meets the course's completion rule now, and when they got there: the last
   * moment a required item was finished or an interview reached the readiness goal.
   */
  private async evaluateCompletion(
    enrollmentId: string,
    courseId: string
  ): Promise<{ met: boolean; at: Date | null }> {
    const [modules, plan, course] = await Promise.all([
      this.courseItems(courseId),
      this.prisma.planItem.findMany({
        where: { enrollmentId },
        select: { itemId: true, createdAt: true },
      }),
      this.prisma.course.findUnique({
        where: { id: courseId },
        select: { readinessThreshold: true },
      }),
    ])
    const items = modules.flatMap((m) => m.items)
    // The outline's required items, plus whatever this learner's results added. An item in both
    // (a review) must be done in the outline and again since it was added to the plan.
    const outline = items
      .filter((i) => !isPracticeItem(i) && !remediationOf(i.config))
      .map((i) => i.id)
    const interviewIds = items.filter((i) => isInterviewLike(i)).map((i) => i.id)
    const [finished, scored] = await Promise.all([
      this.prisma.itemProgress.findMany({
        where: {
          enrollmentId,
          status: 'completed',
          itemId: { in: [...outline, ...plan.map((p) => p.itemId)] },
        },
        select: { itemId: true, status: true, completedAt: true },
      }),
      interviewIds.length
        ? this.prisma.itemProgress.findMany({
            where: { enrollmentId, itemId: { in: interviewIds }, score: { not: null } },
            select: { score: true, completedAt: true },
          })
        : Promise.resolve([] as { score: number | null; completedAt: Date | null }[]),
    ])
    const byItem = new Map(finished.map((p) => [p.itemId, p]))
    const required = outline.length + plan.length
    const done =
      outline.filter((id) => byItem.has(id)).length +
      plan.filter((p) => doneSince(byItem.get(p.itemId), p.createdAt)).length
    // Anything that counts as an interview must reach the course's readiness goal.
    const goal = course?.readinessThreshold ?? 70
    const reached = scored.filter((p) => (p.score as number) >= goal)
    const ready = interviewIds.length === 0 || reached.length > 0
    if (!(required > 0 && done >= required && ready)) return { met: false, at: null }
    const moments = [...finished, ...reached]
      .map((p) => p.completedAt)
      .filter((d): d is Date => d instanceof Date)
    return {
      met: true,
      at: moments.length ? new Date(Math.max(...moments.map((d) => d.getTime()))) : null,
    }
  }

  /**
   * A learner completes the course when every lesson, knowledge check and
   * assessment is done, including a connected tool labelled pre or post (an assessment in
   * Interview Differently), and, when the course has anything that counts as an interview, the
   * best of those scores reaches the course's readiness goal: finishing the program means being
   * ready to interview. A practice interview is not required by itself, but readiness needs one.
   * A completion is a record, so an ordinary change never reopens it; only recomputeCompletion does.
   */
  private async completeIfDone(
    enrollmentId: string,
    status: string,
    courseId: string
  ): Promise<void> {
    if (status === 'completed') return
    const { met, at } = await this.evaluateCompletion(enrollmentId, courseId)
    if (met) {
      await this.prisma.enrollment.update({
        where: { id: enrollmentId },
        data: { status: 'completed', completedAt: at ?? new Date() },
      })
    }
  }

  /**
   * Applies the completion rule as it stands now to one enrollment, in either direction: completes
   * a learner who meets it, reopens one who completed under an older rule, and corrects the
   * completion date. For staff, to settle a record after the rules or the course changed.
   */
  async recomputeCompletion(
    enrollmentId: string
  ): Promise<{ change: 'completed' | 'reopened' | 'date' | null }> {
    const e = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true, status: true, completedAt: true, cohort: { select: { courseId: true } } },
    })
    if (!e) throw new NotFoundException('Enrollment not found')
    if (e.status === 'withdrawn') throw new ConflictException('This learner has withdrawn')
    const courseId = e.cohort.courseId
    if (!courseId) throw new ConflictException('This cohort has no course')
    const { met, at } = await this.evaluateCompletion(enrollmentId, courseId)
    if (met && e.status !== 'completed') {
      await this.prisma.enrollment.update({
        where: { id: enrollmentId },
        data: { status: 'completed', completedAt: at ?? new Date() },
      })
      return { change: 'completed' }
    }
    if (met && at && e.completedAt?.getTime() !== at.getTime()) {
      await this.prisma.enrollment.update({
        where: { id: enrollmentId },
        data: { completedAt: at },
      })
      return { change: 'date' }
    }
    if (!met && e.status === 'completed') {
      await this.prisma.enrollment.update({
        where: { id: enrollmentId },
        data: { status: 'enrolled', completedAt: null },
      })
      return { change: 'reopened' }
    }
    return { change: null }
  }
}

/**
 * What a learner's browser reports for a video. 'player' means the player
 * counted the watching and must show at least the required share, kept as
 * 'player-verified'; 'manual' is the fallback for a video that will not play,
 * kept as 'self-attested'.
 */
export function videoEvidence(body: unknown): {
  evidence: 'player-verified' | 'self-attested'
  watchedPct: number
} {
  const b = (body ?? {}) as { completedBy?: unknown; watchedPct?: unknown }
  if (b.completedBy !== 'player' && b.completedBy !== 'manual')
    throw new BadRequestException(
      'Say whether the video was watched in the player or marked by hand'
    )
  const pct = typeof b.watchedPct === 'number' && Number.isFinite(b.watchedPct) ? b.watchedPct : 0
  const watchedPct = Math.min(100, Math.max(0, Math.round(pct)))
  if (b.completedBy === 'player' && watchedPct < VIDEO_COMPLETE_PCT)
    throw new BadRequestException(`Watch at least ${VIDEO_COMPLETE_PCT}% of the video first.`)
  return { evidence: b.completedBy === 'player' ? 'player-verified' : 'self-attested', watchedPct }
}

/** The record a learner (and their agency) sees, from item results and the course's thresholds. */
export function buildRecord(
  items: { id: string; type: string; label: string | null; config?: unknown }[],
  progress: { itemId: string; status: string; score: number | null }[],
  course: { targetScore: number; readinessThreshold: number },
  completed: boolean
): ReadinessRecord {
  const scoreOf = (
    pick: (i: { type: string; label: string | null; config?: unknown }) => boolean
  ) => {
    const ids = new Set(items.filter(pick).map((i) => i.id))
    const scores = progress
      // Any scored attempt counts, including one still below the item's pass mark.
      .filter((p) => ids.has(p.itemId) && p.score !== null)
      .map((p) => p.score as number)
    return scores.length ? Math.max(...scores) : null
  }
  const pre = scoreOf((i) => i.label === 'pre')
  const post = scoreOf((i) => i.label === 'post')
  const interviewBest = scoreOf(isInterviewLike)
  return {
    pre,
    post,
    gain: pre !== null && post !== null ? post - pre : null,
    targetScore: course.targetScore,
    reachedTarget: post !== null && post >= course.targetScore,
    interviewBest,
    readinessThreshold: course.readinessThreshold,
    interviewReady: interviewBest !== null && interviewBest >= course.readinessThreshold,
    completed,
  }
}

/** The URL a package loads from: same origin as the player, so the SCORM API can be found. */
export function scormSrc(packageId: string, entry: string): string {
  const [path, query] = entry.split('?')
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `/scorm/${packageId}/${encoded}${query ? `?${query}` : ''}`
}

/** Done and score (0-100) from what a SCORM package reported on commit. */
export function scormResult(body: unknown): { done: boolean; score: number | null } {
  const b = (typeof body === 'object' && body !== null ? body : {}) as {
    completionStatus?: unknown
    successStatus?: unknown
    score?: { raw?: unknown; max?: unknown; scaled?: unknown }
  }
  const done = b.completionStatus === 'completed' || b.successStatus === 'passed'
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const raw = num(b.score?.raw)
  const max = num(b.score?.max)
  const scaled = num(b.score?.scaled)
  let score: number | null = null
  if (raw !== null) score = Math.round((raw / (max && max > 0 ? max : 100)) * 100)
  else if (scaled !== null && scaled >= 0 && scaled <= 1) score = Math.round(scaled * 100)
  return { done, score: score === null ? null : Math.max(0, Math.min(100, score)) }
}

/** How many tries a learner gets at a practice interview: the author's setting, 1 to 5, default 1. */
export function attemptsAllowed(
  config: Record<string, unknown> | { maxAttempts?: unknown }
): number {
  const n = (config as { maxAttempts?: unknown }).maxAttempts
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5 ? n : DEFAULT_ATTEMPTS
}
