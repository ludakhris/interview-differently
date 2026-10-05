import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  KnowledgeCheckQuestion,
  LearnerCohortCard,
  LearnerItem,
  LearnerOutline,
  LearnerOutlineItem,
  ProgressStatus,
  QuizResult,
  ReadinessRecord,
} from '@id/types'
import { ClerkService } from '../auth/clerk.service'
import { PrismaService } from '../prisma/prisma.service'
import { cohortStatus } from './cohort-config'
import { gradeQuiz, publicQuestions } from './grade-quiz'

const QUIZ_TYPES = ['knowledge_check', 'assessment']

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
    private readonly clerk: ClerkService
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

  private async courseItems(courseId: string) {
    return this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: { position: 'asc' },
      include: { items: { orderBy: { position: 'asc' } } },
    })
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
          modules.reduce((n, m) => n + m.items.length, 0)
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
      itemsTotal: totals.get(r.cohort.course?.id as string) ?? 0,
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
    const [modules, progress] = await Promise.all([
      this.courseItems(course.id),
      this.prisma.itemProgress.findMany({ where: { enrollmentId: e.id } }),
    ])
    const byItem = new Map(progress.map((p) => [p.itemId, p]))
    const items = modules.flatMap((m) => m.items)
    const done = items.filter((i) => byItem.get(i.id)?.status === 'completed').length
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
        itemsTotal: items.length,
      },
      modules: modules.map((m) => ({
        id: m.id,
        title: m.title,
        items: m.items.map(
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
        items.map((i) => ({ id: i.id, type: i.type, label: i.label })),
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
    const progress = await this.prisma.itemProgress.findUnique({
      where: { enrollmentId_itemId: { enrollmentId: e.id, itemId } },
    })
    return { e, item, progress }
  }

  async item(userId: string, cohortId: string, itemId: string): Promise<LearnerItem> {
    const { e, item, progress } = await this.itemOf(userId, cohortId, itemId)
    const config = (item.config ?? {}) as Record<string, unknown>
    let scenario: LearnerItem['scenario'] = null
    if (item.type === 'interview' && typeof config.scenarioId === 'string' && config.scenarioId) {
      const row = await this.prisma.scenario.findUnique({
        where: { scenarioId: config.scenarioId },
      })
      const title = ((row?.data ?? {}) as { title?: string }).title
      scenario = { id: config.scenarioId, title: title ?? config.scenarioId }
    }
    return {
      id: item.id,
      cohortId,
      type: item.type,
      title: item.title,
      label: item.label,
      body: item.type === 'lesson' ? String(config.body ?? '') : null,
      questions: QUIZ_TYPES.includes(item.type)
        ? publicQuestions((config.questions ?? []) as KnowledgeCheckQuestion[])
        : null,
      scenario,
      status: this.statusOf(progress ?? undefined),
      score: progress?.score ?? null,
      attempts: progress?.attempts ?? 0,
      locked: this.lockReason(e.cohort.startsAt, e.cohort.endsAt),
    }
  }

  async completeLesson(userId: string, cohortId: string, itemId: string): Promise<LearnerItem> {
    const { e, item, progress } = await this.itemOf(userId, cohortId, itemId)
    const locked = this.lockReason(e.cohort.startsAt, e.cohort.endsAt)
    if (locked) throw new ConflictException(locked)
    if (item.type !== 'lesson') throw new ConflictException('Only lessons are marked done this way')
    if (progress?.status !== 'completed') {
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

  async submitQuiz(
    userId: string,
    cohortId: string,
    itemId: string,
    answers: unknown
  ): Promise<{ result: QuizResult; item: LearnerItem }> {
    const { e, item, progress } = await this.itemOf(userId, cohortId, itemId)
    const locked = this.lockReason(e.cohort.startsAt, e.cohort.endsAt)
    if (locked) throw new ConflictException(locked)
    if (!QUIZ_TYPES.includes(item.type)) throw new ConflictException('This item has no questions')
    // Pre and post assessments count once; knowledge checks can be retaken.
    if (item.type === 'assessment' && progress?.status === 'completed') {
      throw new ConflictException('You have already completed this assessment.')
    }
    const questions =
      ((item.config ?? {}) as { questions?: KnowledgeCheckQuestion[] }).questions ?? []
    const result = gradeQuiz(questions, answers)
    const best = Math.max(result.score, progress?.score ?? 0)
    await this.prisma.itemProgress.upsert({
      where: { enrollmentId_itemId: { enrollmentId: e.id, itemId } },
      create: {
        enrollmentId: e.id,
        itemId,
        status: 'completed',
        score: result.score,
        attempts: 1,
        completedAt: new Date(),
      },
      update: {
        status: 'completed',
        score: item.type === 'assessment' ? result.score : best,
        attempts: { increment: 1 },
        completedAt: new Date(),
      },
    })
    await this.completeIfDone(e.id, e.status, e.cohort.course.id)
    return { result, item: await this.item(userId, cohortId, itemId) }
  }

  /**
   * A learner completes the course when every lesson, knowledge check and
   * assessment is done. Practice interviews are scored by an instructor and do
   * not hold completion back.
   */
  private async completeIfDone(
    enrollmentId: string,
    status: string,
    courseId: string
  ): Promise<void> {
    if (status === 'completed') return
    const modules = await this.courseItems(courseId)
    const required = modules.flatMap((m) => m.items).filter((i) => i.type !== 'interview')
    const done = await this.prisma.itemProgress.count({
      where: { enrollmentId, status: 'completed', itemId: { in: required.map((i) => i.id) } },
    })
    if (required.length > 0 && done >= required.length) {
      await this.prisma.enrollment.update({
        where: { id: enrollmentId },
        data: { status: 'completed', completedAt: new Date() },
      })
    }
  }
}

/** The record a learner (and their agency) sees, from item results and the course's thresholds. */
export function buildRecord(
  items: { id: string; type: string; label: string | null }[],
  progress: { itemId: string; status: string; score: number | null }[],
  course: { targetScore: number; readinessThreshold: number },
  completed: boolean
): ReadinessRecord {
  const scoreOf = (pick: (i: { type: string; label: string | null }) => boolean) => {
    const ids = new Set(items.filter(pick).map((i) => i.id))
    const scores = progress
      .filter((p) => ids.has(p.itemId) && p.status === 'completed' && p.score !== null)
      .map((p) => p.score as number)
    return scores.length ? Math.max(...scores) : null
  }
  const pre = scoreOf((i) => i.label === 'pre')
  const post = scoreOf((i) => i.label === 'post')
  const interviewBest = scoreOf((i) => i.type === 'interview')
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
