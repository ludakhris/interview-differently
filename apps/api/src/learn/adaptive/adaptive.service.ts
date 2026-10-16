import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
  PRACTICE_PORT,
  stillAsked,
  type LearnerSlot,
  type PracticePort,
} from '../../core/practice-port'
import { SIMULATOR_FEED, type SimulatorFeed } from '../../core/simulator-feed'
import { SPARK_PORT, type LessonSlotState, type SparkPort } from '../../core/spark-port'
import type { CheckpointHistoryEntry } from '../../core/monitor-types'
import { AccessService } from '../access/access.service'
import { cohortStatus } from '../cohort-config'
import { isSupportedItemType } from '../course-config'
import { LearnerService } from '../learner.service'
import type {
  AdaptiveBoard,
  AdaptiveSyncResult,
  BoardLearner,
  BoardPathItem,
  BoardPractice,
  IntakeLevel,
  LearnerSeen,
  LessonSlot,
  PlanAddition,
  SeenEntry,
} from '../learn-types'
import { adaptiveRules, parseSkills, remediationOf, reviewOf, skillResults } from '../skills'
import { checkpointData, learnerPath, minutesOf, needsHelp, type BoardItem } from './board'
import { PERSONAS, type DemoStep } from './demo-course'
import { checkpointConfig, groupsOf, placementOf } from './placement'
import { checkpointFromHistory } from './sync'

const LEVELS: IntakeLevel[] = ['never', 'some', 'regular']

const sum = (path: { minutes: number }[]) => path.reduce((n, p) => n + p.minutes, 0)

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

interface Actor {
  userId: string
  role?: string
}

/**
 * Adaptive checkpoints, the LMS side (GitHub issue #90). The learner works each checkpoint in the Simulator's page and
 * watches lessons in Spark's player, both embedded in the course; the LMS reads what they did (the simulator feed,
 * the Spark port), keeps the latest result per request as evidence, and changes the plan: content added for a gap,
 * content skipped for a skill shown. Staff get a board of every learner's path and the AI content to review. This
 * service never imports Simulator or Spark code and never sees an answer key.
 */
@Injectable()
export class AdaptiveService {
  private readonly logger = new Logger(AdaptiveService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly learner: LearnerService,
    @Inject(PRACTICE_PORT) private readonly practice: PracticePort,
    @Inject(SPARK_PORT) private readonly spark: SparkPort,
    @Inject(SIMULATOR_FEED) private readonly feed: SimulatorFeed
  ) {}

  // ── the learner ────────────────────────────────────────────────────────────

  private async load(
    userId: string,
    cohortId: string,
    itemId: string,
    kind: 'checkpoint' | 'lesson'
  ) {
    const e = await this.prisma.enrollment.findUnique({
      where: { cohortId_userId: { cohortId, userId } },
      include: { cohort: { include: { course: true } } },
    })
    if (!e || e.status === 'withdrawn' || !e.cohort.course)
      throw new NotFoundException('You are not in this cohort')
    const item = await this.prisma.courseItem.findUnique({
      where: { id: itemId },
      include: { module: { select: { courseId: true } } },
    })
    const right =
      kind === 'checkpoint'
        ? !!item && checkpointConfig(item) !== null
        : item?.type === 'spark_lesson'
    if (
      !item ||
      !right ||
      item.module.courseId !== e.cohort.course.id ||
      !isSupportedItemType(item.type)
    )
      throw new NotFoundException('Item not found')
    const plan = await this.prisma.planItem.findUnique({
      where: { enrollmentId_itemId: { enrollmentId: e.id, itemId } },
    })
    // Extra content opens only for a learner whose plan includes it.
    if (remediationOf(item.config) && !plan) throw new NotFoundException('Item not found')
    const progress = await this.prisma.itemProgress.findUnique({
      where: { enrollmentId_itemId: { enrollmentId: e.id, itemId } },
    })
    return { e, course: e.cohort.course, item, plan, progress }
  }

  private writable(cohort: { startsAt: Date | null; endsAt: Date | null }) {
    const s = cohortStatus(cohort.startsAt, cohort.endsAt)
    if (s === 'upcoming') throw new ConflictException('This cohort has not started yet.')
    if (s === 'completed') throw new ConflictException('This cohort has ended.')
  }

  private skillLabels(course: { skills: unknown }) {
    return new Map(parseSkills(course.skills).map((s) => [s.id, s.label]))
  }

  /** A checkpoint's state for the course page: whether a diagnostic still needs the intake question. */
  async checkpointState(userId: string, cohortId: string, itemId: string) {
    const ctx = await this.load(userId, cohortId, itemId, 'checkpoint')
    const d = checkpointData(ctx.progress?.data)
    return {
      itemId,
      diagnostic: checkpointConfig(ctx.item)?.diagnostic === true,
      intake: (LEVELS as string[]).includes(d.intake ?? '') ? (d.intake as IntakeLevel) : null,
      completed: ctx.progress?.status === 'completed',
    }
  }

  /**
   * What the learner says about themselves before a diagnostic. "Start from the beginning" finishes the diagnostic
   * with no evidence: nothing is skipped and nothing is flagged, the learner takes every lesson.
   */
  async intake(
    userId: string,
    cohortId: string,
    itemId: string,
    body: { level?: unknown; fresh?: unknown }
  ) {
    const ctx = await this.load(userId, cohortId, itemId, 'checkpoint')
    this.writable(ctx.e.cohort)
    if (checkpointConfig(ctx.item)?.diagnostic !== true)
      throw new BadRequestException('Only a diagnostic asks this')
    const level = LEVELS.find((l) => l === body.level)
    if (!level) throw new BadRequestException('Choose how much SQL you have written')
    // The answer only counts before the learner has answered anything (read from the Simulator, not a copy).
    const history = await this.feed.checkpointHistory(ctx.e.cohortId, ctx.e.userId)
    if (history.some((h) => h.itemId === itemId && h.kind === 'answer'))
      throw new ConflictException('You have already started this diagnostic.')
    const fresh = body.fresh === true
    await this.mergeData(ctx.e.id, itemId, { intake: level })
    if (fresh)
      await this.prisma.itemProgress.updateMany({
        where: { enrollmentId: ctx.e.id, itemId, status: { not: 'completed' } },
        data: { status: 'completed', completedAt: new Date() },
      })
    if (fresh) await this.learner.settle(ctx.e.id, ctx.e.status, ctx.course.id)
    return this.checkpointState(userId, cohortId, itemId)
  }

  /**
   * Reads the learner's answers from the Simulator and keeps them on the item's progress: the latest result per
   * request (evidence) and the log. A course checkpoint is finished once every request has a result; a practice slot
   * finishes when the Simulator reports its score.
   */
  private async refresh(ctx: Awaited<ReturnType<AdaptiveService['load']>>) {
    const history = await this.feed.checkpointHistory(ctx.e.cohortId, ctx.e.userId)
    const { results, log } = checkpointFromHistory(history, ctx.item.id)
    const config = checkpointConfig(ctx.item)
    const refs = config?.generated ? [] : (config?.tasks.map((t) => t.ref) ?? [])
    // The same rule the Simulator asks by: a diagnostic stops asking about a skill after a miss.
    const asked = stillAsked(
      refs,
      config?.diagnostic ? groupsOf(config.tasks) : undefined,
      Object.fromEntries(results.map((r) => [r.ref, r]))
    )
    const answered = results.filter((r) => asked.includes(r.ref))
    const finished = asked.length > 0 && answered.length >= asked.length
    await this.mergeData(ctx.e.id, ctx.item.id, { results, log })
    // Finished once, never re-scored here: the Simulator's score report (recordToolResult) keeps the best.
    if (finished)
      await this.prisma.itemProgress.updateMany({
        where: { enrollmentId: ctx.e.id, itemId: ctx.item.id, status: { not: 'completed' } },
        data: {
          status: 'completed',
          completedAt: new Date(),
          score: Math.round((answered.filter((r) => r.correct).length / asked.length) * 100),
        },
      })
    ctx.progress = await this.prisma.itemProgress.findUnique({
      where: { enrollmentId_itemId: { enrollmentId: ctx.e.id, itemId: ctx.item.id } },
    })
    return ctx.progress?.status === 'completed'
  }

  /**
   * Merges keys into an item's progress data in the database, so a concurrent write (the Simulator's score report
   * adds its own keys) is never lost to a stale copy. Creates the row when there is none.
   */
  private async mergeData(enrollmentId: string, itemId: string, patch: object) {
    await this.prisma.itemProgress.upsert({
      where: { enrollmentId_itemId: { enrollmentId, itemId } },
      create: { enrollmentId, itemId, status: 'in_progress', data: {} },
      update: {},
    })
    await this.prisma.$executeRaw`
      UPDATE "ItemProgress"
      SET "data" = COALESCE("data", '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb,
          "updatedAt" = now() AT TIME ZONE 'UTC'
      WHERE "enrollmentId" = ${enrollmentId} AND "itemId" = ${itemId}`
  }

  /**
   * After the learner answered in the Simulator's page: read their answers, update the plan, and say what changed
   * since `since` (the page's last sync), so the course page can show it.
   */
  async sync(
    userId: string,
    cohortId: string,
    itemId: string,
    since?: unknown
  ): Promise<AdaptiveSyncResult> {
    const ctx = await this.load(userId, cohortId, itemId, 'checkpoint')
    this.writable(ctx.e.cohort)
    // `since` is a cursor this endpoint handed out (the server's clock), never the browser's.
    const at = new Date()
    const from =
      typeof since === 'string' && !Number.isNaN(Date.parse(since))
        ? new Date(since)
        : new Date(at.getTime() - 60_000)
    const completed = await this.refresh(ctx)
    if (completed) {
      if (remediationOf(ctx.item.config))
        await this.learner.settle(ctx.e.id, ctx.e.status, ctx.course.id)
      else await this.learner.afterEvidence(ctx.e.id, ctx.e.status, ctx.course, itemId)
    }
    return {
      completed,
      at: at.toISOString(),
      ...(await this.changesSince(ctx.e.id, ctx.course, from)),
    }
  }

  /** What the plan gained and let the learner past since a moment. */
  private async changesSince(
    enrollmentId: string,
    course: { skills: unknown },
    from: Date
  ): Promise<Omit<AdaptiveSyncResult, 'completed' | 'at'>> {
    const labels = this.skillLabels(course)
    const [plan, skips] = await Promise.all([
      this.prisma.planItem.findMany({
        where: { enrollmentId, createdAt: { gte: from } },
        include: { item: { select: { title: true, type: true, config: true } } },
      }),
      this.prisma.planSkip.findMany({
        where: { enrollmentId, createdAt: { gte: from } },
        include: { item: { select: { title: true } } },
      }),
    ])
    const planAdded: PlanAddition[] = plan.map((p) => {
      const r = obj(p.reason)
      return {
        itemId: p.itemId,
        type: p.item.type,
        title: p.item.title,
        skill:
          typeof r.skillLabel === 'string' ? r.skillLabel : (labels.get(String(r.skill)) ?? ''),
        pct: typeof r.pct === 'number' ? r.pct : 0,
        n: typeof r.n === 'number' ? r.n : 0,
        review: reviewOf(p.item.config) !== null,
      }
    })
    return {
      planAdded,
      planSkipped: skips.map((k) => ({
        itemId: k.itemId,
        title: k.item.title,
        skill: labels.get(String(obj(k.reason).skill)) ?? '',
      })),
    }
  }

  // ── lessons made for the learner (Spark) ─────────────────────────────────────

  private slotOf(ctx: {
    e: { cohortId: string; userId: string }
    item: { id: string }
  }): LearnerSlot {
    return { cohortId: ctx.e.cohortId, userId: ctx.e.userId, itemId: ctx.item.id }
  }

  private lessonView(
    ctx: Awaited<ReturnType<AdaptiveService['load']>>,
    state: LessonSlotState
  ): LessonSlot {
    const skill = String(obj(obj(ctx.item.config).generated).skill ?? '')
    return {
      status: state.status,
      skillLabel: this.skillLabels(ctx.course).get(skill) ?? skill,
      title: state.title,
      url: state.url,
      completed: ctx.progress?.status === 'completed',
    }
  }

  /** The slot as it stands; a lesson Spark recorded as watched to the end completes the item here too. */
  async lessonSlot(userId: string, cohortId: string, itemId: string): Promise<LessonSlot> {
    return this.lessonSync(userId, cohortId, itemId)
  }

  /** Asks Spark for a lesson aimed at what this learner got wrong on the slot's skill. */
  async makeLesson(userId: string, cohortId: string, itemId: string): Promise<LessonSlot> {
    const ctx = await this.load(userId, cohortId, itemId, 'lesson')
    this.writable(ctx.e.cohort)
    const current = await this.spark.lessonSlot(this.slotOf(ctx))
    if (current.status !== 'none' && current.status !== 'rejected')
      return this.lessonView(ctx, current)
    const config = obj(ctx.item.config)
    const skill = String(obj(config.generated).skill ?? '')
    const bank = String(config.bank ?? '')
    const [history, { schema }, level] = await Promise.all([
      this.feed.checkpointHistory(cohortId, userId),
      this.practice.bank(bank, []),
      this.intakeOf(ctx.e.id, ctx.course.id),
    ])
    const state = await this.spark.makeLesson({
      slot: this.slotOf(ctx),
      skill: this.skillLabels(ctx.course).get(skill) ?? skill,
      level,
      misses: await this.missesOn(ctx.course.id, skill, bank, history),
      tables: schema
        .map((t) => `${t.table} (${t.columns.map((c) => c.name).join(', ')})`)
        .join('\n'),
      review: adaptiveRules(ctx.course.adaptive).approveGenerated,
    })
    return this.lessonView(ctx, state)
  }

  /** After the player says the lesson ended: Spark's record decides, and like any lesson it is not evidence. */
  async lessonSync(userId: string, cohortId: string, itemId: string): Promise<LessonSlot> {
    const ctx = await this.load(userId, cohortId, itemId, 'lesson')
    const state = await this.spark.lessonSlot(this.slotOf(ctx))
    const open = cohortStatus(ctx.e.cohort.startsAt, ctx.e.cohort.endsAt) === 'running'
    if (state.finished && ctx.progress?.status !== 'completed' && open) {
      ctx.progress = await this.prisma.itemProgress.upsert({
        where: { enrollmentId_itemId: { enrollmentId: ctx.e.id, itemId } },
        create: {
          enrollmentId: ctx.e.id,
          itemId,
          status: 'completed',
          attempts: 1,
          completedAt: new Date(),
        },
        update: { status: 'completed', attempts: { increment: 1 }, completedAt: new Date() },
      })
      await this.learner.settle(ctx.e.id, ctx.e.status, ctx.course.id)
    }
    return this.lessonView(ctx, state)
  }

  /** What the learner said about their experience before the diagnostic, if anything. */
  private async intakeOf(enrollmentId: string, courseId: string): Promise<string | null> {
    const rows = await this.prisma.itemProgress.findMany({
      where: { enrollmentId, item: { type: 'tool', module: { courseId } } },
      select: { data: true },
    })
    for (const r of rows) {
      const level = checkpointData(r.data).intake
      if (level) return level
    }
    return null
  }

  /** The learner's latest wrong answers on a skill, across the course's checkpoints in this bank. */
  private async missesOn(
    courseId: string,
    skill: string,
    bank: string,
    history: CheckpointHistoryEntry[]
  ) {
    const items = await this.prisma.courseItem.findMany({
      where: { type: 'tool', module: { courseId } },
      select: { id: true, type: true, config: true },
    })
    const refs = new Set<string>()
    for (const item of items) {
      const c = checkpointConfig(item)
      if (!c || c.generated || c.bank !== bank) continue
      for (const t of c.tasks) if (t.skill === skill) refs.add(`${item.id}|${t.ref}`)
    }
    const latest = new Map<string, Extract<CheckpointHistoryEntry, { kind: 'answer' }>>()
    for (const h of history)
      if (h.kind === 'answer' && refs.has(`${h.itemId}|${h.ref}`))
        latest.set(`${h.itemId}|${h.ref}`, h)
    return [...latest.values()]
      .filter((h) => !h.correct && !h.passed)
      .map((h) => ({ prompt: h.prompt, sql: h.sql ?? '', reason: h.reason }))
  }

  // ── staff ──────────────────────────────────────────────────────────────────

  private async cohortOf(
    actor: Actor,
    cohortId: string,
    action: 'cohort.read' | 'cohort.staff' | 'cohort.manage'
  ) {
    await this.access.authorize(actor, action, { cohortId })
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      include: { course: true, institution: { select: { featuredDemo: true } } },
    })
    if (!cohort || !cohort.course) throw new NotFoundException('Cohort not found')
    return { ...cohort, course: cohort.course }
  }

  private async itemsOf(courseId: string): Promise<BoardItem[]> {
    const modules = await this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: { position: 'asc' },
      include: { items: { orderBy: { position: 'asc' } } },
    })
    return modules.flatMap((m) =>
      m.items
        .filter((i) => isSupportedItemType(i.type))
        .map((i) => ({
          id: i.id,
          moduleTitle: m.title,
          type: i.type,
          title: i.title,
          config: i.config,
        }))
    )
  }

  /**
   * Whether course staff review this content on the board. With the course's content approval on (approveGenerated):
   * all of it, so content shown without a person's review (approved, reviewedBy null) can be approved too. With it
   * off, AI content goes straight to learners and staff are not asked about it (platform admins still approve it for
   * reuse in Content review); only content still held from when approval was on, which a learner is waiting for, is
   * theirs to review.
   */
  private static forStaff(status: string, approveGenerated: boolean): boolean {
    return approveGenerated || status === 'pending'
  }

  /**
   * A video made for the learner shows under its own title (Spark's, once it is ready), not the slot's ("Video made
   * for you: filters"), as on the learner's own course page. A title Spark cannot give keeps the slot's.
   */
  private async withLessonTitles(cohortId: string, userId: string, path: BoardPathItem[]) {
    await Promise.all(
      path
        .filter((p) => p.type === 'spark_lesson' && p.state !== 'skipped')
        .map(async (p) => {
          try {
            p.title =
              (await this.spark.lessonTitle({ cohortId, userId, itemId: p.itemId })) ?? p.title
          } catch (err) {
            this.logger.warn(`Lesson title for ${p.itemId} unavailable: ${(err as Error).message}`)
          }
        })
    )
  }

  /** The AI content made for the cohort's learners that staff review on the board (`forStaff`). */
  private async contentOf(
    cohortId: string,
    nameOf: Map<string, string>,
    approveGenerated: boolean
  ): Promise<BoardPractice[]> {
    const [all, allLessons] = await Promise.all([
      this.practice.practiceInCohort(cohortId),
      this.spark.lessonsInCohort(cohortId),
    ])
    const practice = all.filter((p) => AdaptiveService.forStaff(p.status, approveGenerated))
    const lessons = allLessons.filter((l) => AdaptiveService.forStaff(l.status, approveGenerated))
    const who = (used: { userId: string }[]) =>
      used.map((u) => nameOf.get(u.userId) ?? 'A learner').join(', ') || 'A learner'
    return [
      ...practice.map((p) => ({
        id: p.id,
        kind: 'practice' as const,
        learnerName: who(p.usedBy),
        skillLabel: p.skill,
        status: p.status,
        reviewed: p.reviewedBy !== null,
        intro: p.intro,
        tasks: p.tasks,
        model: p.model,
        createdAt: p.createdAt,
      })),
      ...lessons.map((l) => ({
        id: l.id,
        kind: 'lesson' as const,
        learnerName: who(l.usedBy),
        skillLabel: l.skill,
        status: l.status,
        reviewed: l.reviewedBy !== null,
        intro: l.title,
        tasks: l.scenes.map((sc) => `${sc.heading}: ${sc.narration}`),
        model: l.model,
        createdAt: l.createdAt,
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async board(actor: Actor, cohortId: string): Promise<AdaptiveBoard> {
    const cohort = await this.cohortOf(actor, cohortId, 'cohort.read')
    const course = cohort.course
    const skills = parseSkills(course.skills)
    const labels = new Map(skills.map((s) => [s.id, s.label]))
    const items = await this.itemsOf(course.id)
    const enrollments = await this.prisma.enrollment.findMany({
      where: { cohortId, status: { not: 'withdrawn' } },
      include: {
        user: { select: { displayName: true, email: true } },
        progress: true,
        plan: { orderBy: { createdAt: 'asc' } },
        skips: true,
      },
      orderBy: { enrolledAt: 'asc' },
    })
    const nameOf = new Map(
      enrollments.map((e) => [e.userId, e.user.displayName ?? e.user.email ?? 'A learner'])
    )
    const diag = items.find((i) => checkpointConfig(i)?.diagnostic === true)
    const learners: BoardLearner[] = []
    for (const e of enrollments) {
      const progress = new Map(e.progress.map((p) => [p.itemId, p]))
      const results = skillResults(skills, items, progress)
      const path = learnerPath(items, progress, e.plan, e.skips, labels)
      await this.withLessonTitles(cohortId, e.userId, path)
      const intake = diag ? checkpointData(progress.get(diag.id)?.data).intake : undefined
      const persona = cohort.institution.featuredDemo
        ? PERSONAS.find((p) => p.userId === e.userId)
        : undefined
      const required = path.filter((p) => p.state !== 'skipped')
      learners.push({
        enrollmentId: e.id,
        userId: e.userId,
        name: nameOf.get(e.userId) as string,
        intake: (LEVELS as string[]).includes(intake ?? '') ? (intake as IntakeLevel) : null,
        skills: results.map((r) => ({ skillId: r.skillId, pct: r.pct, n: r.n, status: r.status })),
        path,
        needsHelp: needsHelp(items, progress, e.plan, results),
        ready: results.length > 0 && results.every((r) => r.status === 'demonstrated'),
        itemsDone: required.filter((p) => p.state === 'done' || p.state === 'added_done').length,
        itemsTotal: required.length,
        minutesLeft: sum(required.filter((p) => p.state !== 'done' && p.state !== 'added_done')),
        minutesTotal: sum(required),
        minutesSaved: sum(path.filter((p) => p.state === 'skipped')),
        demo: persona
          ? {
              persona: persona.id,
              next: persona.steps[this.demoStepOf(progress, diag?.id)]?.say ?? null,
            }
          : null,
      })
    }
    return {
      cohortId,
      courseTitle: course.title,
      skills: skills.map((s) => ({
        id: s.id,
        label: s.label,
        targetPct: s.targetPct,
        minEvidence: s.minEvidence ?? 1,
      })),
      settings: {
        ...adaptiveRules(course.adaptive),
        canEdit: await this.access.can(actor, 'course.manage', {
          institutionId: course.providerId,
        }),
      },
      learners,
      practice: await this.contentOf(
        cohortId,
        nameOf,
        adaptiveRules(course.adaptive).approveGenerated
      ),
      jobTitle: course.targetRoles[0] ?? null,
      outline: items
        .filter((i) => !remediationOf(i.config))
        .map((i) => ({
          itemId: i.id,
          title: i.title,
          moduleTitle: i.moduleTitle,
          type: i.type,
          minutes: minutesOf(i),
        })),
    }
  }

  /**
   * What one learner saw, in order, for staff: each request and their answer, every piece of help shown (from the
   * Simulator), and the lessons made for them with how far they watched (from Spark).
   */
  async seen(actor: Actor, cohortId: string, enrollmentId: string): Promise<LearnerSeen> {
    const cohort = await this.cohortOf(actor, cohortId, 'cohort.read')
    const e = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { user: { select: { displayName: true, email: true } } },
    })
    if (!e || e.cohortId !== cohort.id) throw new NotFoundException('Learner not found')
    const [items, history, lessons] = await Promise.all([
      this.prisma.courseItem.findMany({
        where: { module: { courseId: cohort.course.id } },
        select: { id: true, title: true },
      }),
      this.feed.checkpointHistory(cohortId, e.userId),
      this.spark.lessonHistory(cohortId, e.userId),
    ])
    const title = (id: string) => items.find((i) => i.id === id)?.title ?? 'An item'
    const entries: SeenEntry[] = history.map((h): SeenEntry => {
      if (h.kind === 'answer')
        return {
          kind: 'request',
          at: h.at,
          item: title(h.itemId),
          from: h.from,
          prompt: h.prompt,
          sql: h.passed ? null : h.sql,
          correct: h.correct,
          passed: h.passed,
          reason: h.reason,
        }
      if (h.kind === 'help')
        return {
          kind: 'help',
          at: h.at,
          item: title(h.itemId),
          helpKind: h.helpKind,
          text: h.text,
          exampleSql: h.exampleSql,
        }
      return { kind: 'practice', at: h.at, item: title(h.itemId), intro: h.intro, tasks: h.tasks }
    })
    for (const l of lessons)
      entries.push({
        kind: 'video',
        at: l.at,
        item: title(l.itemId),
        lessonId: l.lessonId,
        title: l.title,
        scenes: l.scenes,
        watched: l.watched,
      })
    return {
      name: e.user.displayName ?? e.user.email ?? 'A learner',
      entries: entries.sort((a, b) => a.at.localeCompare(b.at)),
    }
  }

  /**
   * A link to play a lesson the learner was given, from the seen view, in Spark's player. Anyone who may see what they
   * saw may watch it, sent back or not; it records nothing.
   */
  async watchSeenLesson(
    actor: Actor,
    cohortId: string,
    enrollmentId: string,
    lessonId: string
  ): Promise<{ url: string }> {
    const cohort = await this.cohortOf(actor, cohortId, 'cohort.read')
    const e = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } })
    if (!e || e.cohortId !== cohort.id) throw new NotFoundException('Learner not found')
    const lessons = await this.spark.lessonHistory(cohortId, e.userId)
    if (!lessons.some((l) => l.lessonId === lessonId))
      throw new NotFoundException('Lesson not found')
    return { url: await this.spark.previewLink(lessonId, actor.userId) }
  }

  /** Approves or sends back AI content made for one of this cohort's learners. */
  async review(actor: Actor, cohortId: string, contentId: string, approve: unknown) {
    // A send-back changes what learners are given, so it is never read from a missing or mistyped field.
    if (typeof approve !== 'boolean') throw new BadRequestException('approve must be true or false')
    const cohort = await this.cohortOf(actor, cohortId, 'cohort.staff')
    const [practice, lessons] = await Promise.all([
      this.practice.practiceInCohort(cohortId),
      this.spark.lessonsInCohort(cohortId),
    ])
    const p = practice.find((x) => x.id === contentId)
    const found = p ?? lessons.find((x) => x.id === contentId)
    if (!found) throw new NotFoundException('Content not found')
    // Only what the board lists (contentOf): with approval off, content already shown to learners is not staff's.
    const approveGenerated = adaptiveRules(cohort.course.adaptive).approveGenerated
    if (!AdaptiveService.forStaff(found.status, approveGenerated))
      throw new ConflictException(
        'Content approval is off for this course, so AI-written content goes straight to learners. Platform admins approve it for reuse in Content review.'
      )
    return p
      ? this.practice.review(contentId, approve, actor.userId, cohortId)
      : this.spark.reviewLesson(contentId, approve, actor.userId, cohortId)
  }

  /** A link for staff to watch a lesson made for one of this cohort's learners before reviewing it. */
  async previewLesson(actor: Actor, cohortId: string, lessonId: string): Promise<{ url: string }> {
    await this.cohortOf(actor, cohortId, 'cohort.staff')
    const lessons = await this.spark.lessonsInCohort(cohortId)
    if (!lessons.some((l) => l.id === lessonId)) throw new NotFoundException('Lesson not found')
    return { url: await this.spark.previewLink(lessonId, actor.userId) }
  }

  /** The course's adaptive rules. Course authors only: one course runs in many cohorts. */
  async settings(
    actor: Actor,
    cohortId: string,
    body: { testOut?: unknown; approveGenerated?: unknown }
  ) {
    const cohort = await this.cohortOf(actor, cohortId, 'cohort.read')
    await this.access.authorize(actor, 'course.manage', { institutionId: cohort.course.providerId })
    const next = { ...adaptiveRules(cohort.course.adaptive) }
    if (typeof body.testOut === 'boolean') next.testOut = body.testOut
    if (typeof body.approveGenerated === 'boolean') next.approveGenerated = body.approveGenerated
    await this.prisma.course.update({ where: { id: cohort.course.id }, data: { adaptive: next } })
    return next
  }

  // ── the demo ───────────────────────────────────────────────────────────────

  /** How many of a persona's scripted steps have run, kept on their diagnostic's progress. */
  private demoStepOf(progress: Map<string, { data: unknown }>, diagId: string | undefined): number {
    const n = diagId ? obj(obj(progress.get(diagId)?.data).demo).step : 0
    return typeof n === 'number' ? n : 0
  }

  /**
   * Starts the demo over: the scripted learners lose everything they did by being enrolled afresh, and their
   * checkpoint and lesson history in the Simulator and Spark goes with their uses (the AI content stays in the
   * library). Only in a featured demo institution, only its seeded personas.
   */
  async demoReset(actor: Actor, cohortId: string) {
    const cohort = await this.cohortOf(actor, cohortId, 'cohort.manage')
    if (!cohort.institution.featuredDemo)
      throw new ForbiddenException('Only demo cohorts can be reset')
    for (const p of PERSONAS) {
      const e = await this.prisma.enrollment.findUnique({
        where: { cohortId_userId: { cohortId, userId: p.userId } },
      })
      if (!e) continue
      await this.prisma.enrollment.delete({ where: { id: e.id } })
      await this.prisma.enrollment.create({ data: { id: e.id, cohortId, userId: p.userId } })
    }
    await this.practice.demoForget(
      cohortId,
      PERSONAS.map((p) => p.userId)
    )
    await this.spark.demoForget(
      cohortId,
      PERSONAS.map((p) => p.userId)
    )
    return { ok: true }
  }

  /**
   * Plays a demo persona's next step through the same code a learner's actions reach: the Simulator grades and
   * records answers, Spark writes and plays lessons, and the LMS reads them back as for a real learner. Only in a
   * featured demo institution, only for its seeded personas, and only for staff who manage the cohort.
   */
  async demoStep(actor: Actor, cohortId: string, personaId: string) {
    const cohort = await this.cohortOf(actor, cohortId, 'cohort.manage')
    if (!cohort.institution.featuredDemo)
      throw new ForbiddenException('Only demo cohorts can be autoplayed')
    const persona = PERSONAS.find((p) => p.id === personaId)
    if (!persona) throw new NotFoundException('No such demo learner')
    const items = await this.prisma.courseItem.findMany({
      where: { module: { courseId: cohort.course.id } },
      select: { id: true, title: true, type: true, config: true },
    })
    const diag = items.find((i) => checkpointConfig(i)?.diagnostic === true)
    if (!diag) throw new NotFoundException('The demo course has no diagnostic')
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { cohortId_userId: { cohortId, userId: persona.userId } },
      include: { progress: { where: { itemId: diag.id } } },
    })
    if (!enrollment) throw new NotFoundException('That demo learner is not in this cohort')
    const done = this.demoStepOf(new Map(enrollment.progress.map((p) => [p.itemId, p])), diag.id)
    const step: DemoStep | undefined = persona.steps[done]
    if (!step) return { done: true, say: `${persona.name} has finished the script`, result: null }
    const itemOf = (title: string) => {
      const found = items.find((i) => i.title === title)
      if (!found) throw new NotFoundException(`The demo course has no item “${title}”`)
      return found
    }
    const u = persona.userId
    const slot = (itemId: string): LearnerSlot => ({ cohortId, userId: u, itemId })
    const placement = (item: (typeof items)[number]) => {
      const p = placementOf(item, cohort.course, items)
      if (!p) throw new NotFoundException(`“${item.title}” is not a checkpoint`)
      return p
    }
    let result: unknown
    switch (step.do) {
      case 'intake':
        result = await this.intake(u, cohortId, diag.id, { level: step.level, fresh: step.fresh })
        break
      case 'submit': {
        const item = itemOf(step.item)
        const answer = await this.practice.demoAnswer(slot(item.id), placement(item), {
          ref: step.ref,
          sql: step.sql,
        })
        // The Simulator reports a finished checkpoint's score to the course, as its LTI passback would.
        if (answer.done && answer.scorePct !== null)
          await this.learner.recordToolResult(u, cohortId, item.id, { scorePct: answer.scorePct })
        result = {
          answer,
          ...(await this.sync(u, cohortId, item.id, new Date(Date.now() - 5_000).toISOString())),
        }
        break
      }
      case 'help': {
        const item = itemOf(step.item)
        await this.practice.demoHelp(slot(item.id), placement(item), {
          ref: step.ref,
          sql: step.sql,
          kind: step.kind,
        })
        result = await this.sync(u, cohortId, item.id)
        break
      }
      case 'lesson':
        result = await this.learner.completeLesson(u, cohortId, itemOf(step.item).id)
        break
      case 'practice': {
        const item = itemOf(step.item)
        result = await this.practice.demoPractice(slot(item.id), placement(item))
        break
      }
      case 'solve': {
        const item = itemOf(step.item)
        const solved = await this.practice.demoSolve(slot(item.id), placement(item))
        // Practice that is not ready (held for staff review) cannot be worked: stop here, without counting the step.
        if (solved.status !== 'ready')
          throw new ConflictException(
            solved.status === 'pending'
              ? `${persona.name}’s practice is waiting for review: approve it on the board, then play again`
              : `${persona.name} has no practice ready to work through yet`
          )
        // Finished, its score goes to the course as a finished checkpoint's does (see 'submit').
        if (solved.done && solved.scorePct !== null)
          await this.learner.recordToolResult(u, cohortId, item.id, { scorePct: solved.scorePct })
        result = {
          solved,
          ...(await this.sync(u, cohortId, item.id, new Date(Date.now() - 5_000).toISOString())),
        }
        break
      }
      case 'video':
        result = await this.makeLesson(u, cohortId, itemOf(step.item).id)
        break
      case 'watch': {
        const id = itemOf(step.item).id
        await this.spark.demoWatch(slot(id))
        result = await this.lessonSync(u, cohortId, id)
        break
      }
    }
    // Count the step only once it has run.
    const row = await this.prisma.itemProgress.findUnique({
      where: { enrollmentId_itemId: { enrollmentId: enrollment.id, itemId: diag.id } },
    })
    const data = { ...obj(row?.data), demo: { step: done + 1 } }
    await this.prisma.itemProgress.upsert({
      where: { enrollmentId_itemId: { enrollmentId: enrollment.id, itemId: diag.id } },
      create: { enrollmentId: enrollment.id, itemId: diag.id, status: 'in_progress', data },
      update: { data },
    })
    return { done: false, say: step.say, step: step.do, result }
  }
}
