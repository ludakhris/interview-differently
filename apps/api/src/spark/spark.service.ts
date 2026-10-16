import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import type { Lesson, LessonUse } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { runAsSystem } from '../core/tenant-context'
import type { LessonPlayerView, LessonScene } from '../core/lesson-types'
import {
  LIBRARY_LIMIT,
  libraryWhere,
  type LearnerSlot,
  type LibraryFilter,
  type LibraryPage,
} from '../core/practice-port'
import type {
  LessonContentView,
  LessonHistoryEntry,
  LessonRequest,
  LessonSlotState,
  SparkPort,
} from '../core/spark-port'
import { FINISH_EVENTS, hasFinished, parseEventInput, watchedSummary } from './lesson-events'
import {
  fitsTables,
  LESSON_PROMPT_VERSION,
  LESSON_SCHEMA,
  LESSON_SYSTEM,
  lessonPrompt,
  parseLesson,
} from './lessons'
import {
  isPreview,
  playerUrl,
  signPlayerToken,
  signPreviewToken,
  type PlayerToken,
  type SparkLink,
} from './player-token'
import { LessonFailureLog } from './lesson-failure-log'
import { canSpeak, speak } from './voice'

/** Written lessons are reviewed (or at least seen) before they matter; set SPARK_LESSON_MODEL to change it. */
export const LESSON_MODEL = process.env.SPARK_LESSON_MODEL || 'claude-sonnet-5-5'

/** Token counts as stored on a Lesson, summed over every try it took to write it. */
export interface LessonUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Adds one response's `usage` to the running total (the cache counts may be absent or null). */
export function addUsage(
  total: LessonUsage,
  usage:
    | {
        input_tokens?: number | null
        output_tokens?: number | null
        cache_read_input_tokens?: number | null
        cache_creation_input_tokens?: number | null
      }
    | null
    | undefined
): LessonUsage {
  return {
    inputTokens: total.inputTokens + (usage?.input_tokens ?? 0),
    outputTokens: total.outputTokens + (usage?.output_tokens ?? 0),
    cacheReadTokens: total.cacheReadTokens + (usage?.cache_read_input_tokens ?? 0),
    cacheWriteTokens: total.cacheWriteTokens + (usage?.cache_creation_input_tokens ?? 0),
  }
}

type UseWithLesson = LessonUse & { lesson: Lesson }

const SLOT_STATUS: Record<string, LessonSlotState['status']> = {
  approved: 'ready',
  pending: 'pending',
  rejected: 'rejected',
}

/**
 * Micro Learning (Spark) for the LMS (GitHub issue #90): short lessons aimed at one learner's gap, a storyboard of
 * scenes with narration and a small visual that Spark's player (apps/spark) plays like a video. Lessons are library
 * content (`Lesson`); a learner's use of one is a tenant row (`LessonUse`) and how they watched it is `LessonEvent`.
 * A person-approved lesson is reused before a new one is written. Implements the core port, so the LMS never
 * imports this module; the player reaches it through SparkPlayerController with a signed link.
 */
@Injectable()
export class SparkService implements SparkPort {
  private readonly logger = new Logger(SparkService.name)
  private client: Anthropic | null | undefined

  constructor(
    private readonly prisma: PrismaService,
    private readonly failures: LessonFailureLog
  ) {}

  private ai(): Anthropic | null {
    if (this.client === undefined) {
      try {
        const client = new Anthropic()
        // The SDK builds a client with no key, whose every call then fails: that is not configured.
        this.client = client.apiKey || client.authToken ? client : null
      } catch {
        this.client = null
      }
    }
    return this.client
  }

  /** Whether lessons can be written: the AI client has a key (for the System status page, GitHub issue #92). */
  aiConfigured(): boolean {
    return this.ai() !== null
  }

  // ── the port ───────────────────────────────────────────────────────────────

  async lessonSlot(slot: LearnerSlot): Promise<LessonSlotState> {
    return this.state(await this.newestUse(slot))
  }

  async lessonTitle(slot: LearnerSlot): Promise<string | null> {
    const use = await this.newestUse(slot)
    return use && !use.sentBackAt && use.lesson.status === 'approved' ? use.lesson.title : null
  }

  async makeLesson(request: LessonRequest): Promise<LessonSlotState> {
    const { slot } = request
    const current = await this.newestUse(slot)
    // A rejected or sent-back lesson is replaced; anything else the slot already has is kept.
    if (current && !current.sentBackAt && current.lesson.status !== 'rejected')
      return this.state(current)

    const reused = await this.reusable(request)
    const lesson = reused ?? (await this.write(request))
    const use = await this.prisma.lessonUse.create({
      data: {
        lessonId: lesson.id,
        cohortId: slot.cohortId,
        userId: slot.userId,
        itemId: slot.itemId,
      },
    })
    return this.state({ ...use, lesson })
  }

  async lessonsInCohort(cohortId: string): Promise<LessonContentView[]> {
    // Lessons sent back for this cohort leave its board (their uses stay, as history).
    const uses = await this.prisma.lessonUse.findMany({
      where: { cohortId, sentBackAt: null },
      include: { lesson: true },
      orderBy: { createdAt: 'desc' },
    })
    const byLesson = new Map<string, { lesson: Lesson; uses: LessonUse[] }>()
    for (const u of uses) {
      const entry = byLesson.get(u.lessonId) ?? { lesson: u.lesson, uses: [] }
      entry.uses.push(u)
      byLesson.set(u.lessonId, entry)
    }
    return [...byLesson.values()]
      .sort((a, b) => b.lesson.createdAt.getTime() - a.lesson.createdAt.getTime())
      .map(({ lesson, uses }) => contentView(lesson, uses))
  }

  async lessonHistory(cohortId: string, userId: string): Promise<LessonHistoryEntry[]> {
    const uses = await this.prisma.lessonUse.findMany({
      where: { cohortId, userId },
      include: { lesson: true, events: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    })
    return uses.map((u) => {
      const scenes = u.lesson.scenes as unknown as LessonScene[]
      return {
        at: u.createdAt.toISOString(),
        itemId: u.itemId,
        lessonId: u.lessonId,
        title: u.lesson.title,
        scenes,
        watched: watchedSummary(u.events, scenes.length),
      }
    })
  }

  /**
   * Staff of `cohortId` review a lesson their learners were given (the LMS checks they manage the cohort and that the
   * lesson is used there). Approving approves a pending library row. Sending back marks this cohort's uses sent back:
   * the rows and their events are kept as history, those slots can be given a new lesson, and the lesson is not reused
   * in this cohort. The library row is rejected only when no other cohort has a use not sent back. The view lists only
   * this cohort's live uses.
   */
  async reviewLesson(
    lessonId: string,
    approve: boolean,
    reviewerId: string,
    cohortId: string
  ): Promise<LessonContentView> {
    let lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } })
    if (!lesson) throw new NotFoundException('Lesson not found')
    const decide = (status: 'approved' | 'rejected') =>
      this.prisma.lesson.update({
        where: { id: lessonId },
        data: { status, reviewedBy: reviewerId, reviewedAt: new Date() },
      })
    if (approve) {
      // A pending lesson, or one shown without review (the course did not hold it) that no person has approved yet:
      // a person's approval is what lets the library reuse it. An approved one keeps its first reviewer.
      if (lesson.status === 'pending' || (lesson.status === 'approved' && !lesson.reviewedBy))
        lesson = await decide('approved')
    } else {
      await this.prisma.lessonUse.updateMany({
        where: { lessonId, cohortId, sentBackAt: null },
        data: { sentBackAt: new Date() },
      })
      // Other cohorts' uses may be in agencies this reviewer cannot see, so they are counted as the system: a
      // number only, and it keeps one agency's send-back from taking a lesson from another's learners.
      const elsewhere = await runAsSystem(() =>
        this.prisma.lessonUse.count({
          where: { lessonId, cohortId: { not: cohortId }, sentBackAt: null },
        })
      )
      if (elsewhere === 0) lesson = await decide('rejected')
    }
    const uses = await this.prisma.lessonUse.findMany({
      where: { lessonId, cohortId, sentBackAt: null },
      orderBy: { createdAt: 'asc' },
    })
    return contentView(lesson, uses)
  }

  /**
   * The lesson library for a system admin (SparkPort.lessonLibrary), newest first. The LMS checks the caller is one;
   * the request then reads as every agency, so the uses listed are those in every cohort.
   */
  async lessonLibrary(filter: LibraryFilter): Promise<LibraryPage<LessonContentView>> {
    const where = libraryWhere(filter)
    const [lessons, total] = await Promise.all([
      this.prisma.lesson.findMany({ where, orderBy: { createdAt: 'desc' }, take: LIBRARY_LIMIT }),
      this.prisma.lesson.count({ where }),
    ])
    const uses = lessons.length
      ? await this.prisma.lessonUse.findMany({
          where: { lessonId: { in: lessons.map((l) => l.id) }, sentBackAt: null },
          orderBy: { createdAt: 'asc' },
        })
      : []
    return {
      rows: lessons.map((l) =>
        contentView(
          l,
          uses.filter((u) => u.lessonId === l.id)
        )
      ),
      total,
    }
  }

  /**
   * A system admin's library decision (SparkPort.curateLesson). Approving sets 'approved' and the reviewer, which
   * makes the lesson reusable for any learner. Rejecting sets 'rejected' and the reviewer: the player no longer shows
   * it, nothing reuses it, and its learners can be given a new one. Uses are kept, as the record of who had it.
   */
  async curateLesson(
    lessonId: string,
    approve: boolean,
    reviewerId: string
  ): Promise<LessonContentView> {
    const found = await this.prisma.lesson.findUnique({ where: { id: lessonId } })
    if (!found) throw new NotFoundException('Lesson not found')
    const lesson = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        status: approve ? 'approved' : 'rejected',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      },
    })
    const uses = await this.prisma.lessonUse.findMany({
      where: { lessonId, sentBackAt: null },
      orderBy: { createdAt: 'asc' },
    })
    return contentView(lesson, uses)
  }

  /**
   * A reviewer's link to watch a lesson in the player before deciding (SparkPort.previewLink), whatever its status.
   * The LMS checks the reviewer may see it; the link records nothing and expires after an hour (PREVIEW_TTL_S).
   */
  async previewLink(lessonId: string, viewerId: string): Promise<string> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true },
    })
    if (!lesson) throw new NotFoundException('Lesson not found')
    return playerUrl(signPreviewToken({ sub: viewerId, lessonId: lesson.id }))
  }

  async demoWatch(slot: LearnerSlot): Promise<void> {
    const use = await this.newestUse(slot)
    if (!use || use.sentBackAt) return
    // Said out loud, so a demo step on a lesson nobody can play fails where the presenter sees it.
    if (use.lesson.status !== 'approved')
      throw new ConflictException(
        use.lesson.status === 'rejected'
          ? 'That lesson was sent back'
          : 'That lesson is waiting for review'
      )
    const scenes = use.lesson.scenes as unknown as LessonScene[]
    const voice = canSpeak() ? 'server' : 'browser'
    const steps = [
      { event: 'start', data: { scene: 0, voice } },
      ...scenes.map((_, i) => ({ event: 'scene', data: { scene: i, voice } })),
      { event: 'finish', data: { scene: Math.max(0, scenes.length - 1), voice } },
    ]
    // Spaced a millisecond apart so the order reads back as the player would have written it.
    const base = Date.now()
    await this.prisma.lessonEvent.createMany({
      data: steps.map((s, i) => ({
        lessonUseId: use.id,
        cohortId: use.cohortId,
        userId: use.userId,
        event: s.event,
        data: s.data,
        createdAt: new Date(base + i),
      })),
    })
  }

  /** Demo reset: forgets which lessons these learners were given in the cohort (their events go too). */
  async demoForget(cohortId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return
    await this.prisma.lessonUse.deleteMany({ where: { cohortId, userId: { in: userIds } } })
  }

  // ── the player (SparkPlayerController, signed link) ────────────────────────

  async playerView(token: SparkLink): Promise<LessonPlayerView> {
    if (isPreview(token)) {
      const lesson = await this.previewed(token)
      return {
        title: lesson.title,
        scenes: lesson.scenes as unknown as LessonScene[],
        voice: canSpeak(),
        finished: false,
        preview: true,
      }
    }
    const use = await this.playable(token)
    return {
      title: use.lesson.title,
      scenes: use.lesson.scenes as unknown as LessonScene[],
      voice: canSpeak(),
      finished: await this.finished(use),
    }
  }

  /** The server's recording of one scene's narration, or null when this server cannot speak. */
  async sceneAudio(token: SparkLink, scene: number): Promise<Buffer | null> {
    const lesson = isPreview(token)
      ? await this.previewed(token)
      : (await this.playable(token)).lesson
    const scenes = lesson.scenes as unknown as LessonScene[]
    if (!Number.isInteger(scene) || scene < 0 || scene >= scenes.length)
      throw new NotFoundException('No such scene')
    if (!canSpeak()) return null
    return speak(scenes[scene].narration)
  }

  /** Records what the player reports; false when the event is not one the player sends. */
  async recordEvent(token: PlayerToken, body: unknown): Promise<boolean> {
    const use = await this.playable(token)
    const input = parseEventInput(body, (use.lesson.scenes as unknown as LessonScene[]).length)
    if (!input) return false
    await this.prisma.lessonEvent.create({
      data: {
        lessonUseId: use.id,
        cohortId: use.cohortId,
        userId: use.userId,
        event: input.event,
        data: input.data,
      },
    })
    return true
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private newestUse(slot: LearnerSlot): Promise<UseWithLesson | null> {
    return this.prisma.lessonUse.findFirst({
      where: { cohortId: slot.cohortId, userId: slot.userId, itemId: slot.itemId },
      include: { lesson: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  /** The slot's state. A use sent back reads as no lesson yet, so the learner can be given a new one. */
  private async state(use: UseWithLesson | null): Promise<LessonSlotState> {
    if (!use || use.sentBackAt)
      return { status: 'none', lessonId: null, title: null, url: null, finished: false }
    const status = SLOT_STATUS[use.lesson.status] ?? 'pending'
    const finished = await this.finished(use)
    return {
      status,
      lessonId: use.lesson.id,
      // A lesson no one may see yet (waiting for review, or sent back) is not named to the learner.
      title: status === 'ready' ? use.lesson.title : null,
      url:
        status === 'ready'
          ? playerUrl(
              signPlayerToken({
                sub: use.userId,
                cohortId: use.cohortId,
                itemId: use.itemId,
                useId: use.id,
              })
            )
          : null,
      finished,
    }
  }

  /** The learner reached every scene of this use's lesson and played it to the end (see hasFinished). */
  private async finished(use: UseWithLesson): Promise<boolean> {
    const events = await this.prisma.lessonEvent.findMany({
      where: { lessonUseId: use.id, event: { in: [...FINISH_EVENTS] } },
      select: { event: true, data: true },
    })
    return hasFinished(events, (use.lesson.scenes as unknown as LessonScene[]).length)
  }

  /**
   * An approved, person-reviewed lesson on the skill that this learner has not been given in this cohort, and that
   * was not sent back in this cohort, whose SQL uses only this course's tables (skill labels repeat across courses):
   * one written for their level first, then any level. Newest first.
   */
  private async reusable(request: LessonRequest): Promise<Lesson | null> {
    const { slot } = request
    const given = await this.prisma.lessonUse.findMany({
      where: {
        cohortId: slot.cohortId,
        OR: [{ userId: slot.userId }, { sentBackAt: { not: null } }],
      },
      select: { lessonId: true },
    })
    const candidates = await this.prisma.lesson.findMany({
      where: {
        skill: request.skill,
        status: 'approved',
        reviewedBy: { not: null },
        id: { notIn: given.map((g) => g.lessonId) },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const fits = candidates.filter((l) =>
      fitsTables(l.scenes as unknown as LessonScene[], request.tables)
    )
    return (
      (request.level ? fits.find((l) => l.level === request.level) : undefined) ?? fits[0] ?? null
    )
  }

  /** A new lesson written by Claude and stored in the library, held for review when the request asks. */
  private async write(request: LessonRequest): Promise<Lesson> {
    const client = this.ai()
    if (!client) {
      const reason = 'Lessons made for you need the AI service, which is not configured.'
      // not awaited, and it never rejects: recording never slows or breaks the learner's request (GitHub issue #92)
      void this.failures.record(reason, 'not-configured')
      throw new ServiceUnavailableException(reason)
    }
    let lesson: { title: string; scenes: LessonScene[] } | null = null
    let model = LESSON_MODEL
    let usage: LessonUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }
    // Two tries: a storyboard with too few usable scenes is thrown away, never shown.
    for (let attempt = 0; attempt < 2 && !lesson; attempt++) {
      try {
        const res = await client.messages.create(
          {
            model: LESSON_MODEL,
            max_tokens: 8000,
            system: LESSON_SYSTEM,
            output_config: {
              effort: 'medium',
              format: {
                type: 'json_schema',
                schema: LESSON_SCHEMA as unknown as Record<string, unknown>,
              },
            },
            messages: [
              {
                role: 'user',
                content: lessonPrompt({
                  skillLabel: request.skill,
                  tables: request.tables,
                  level: request.level,
                  misses: request.misses,
                }),
              },
            ],
          },
          { timeout: 60_000, maxRetries: 1 }
        )
        model = res.model || model
        usage = addUsage(usage, res.usage)
        const text = res.content.find((b) => b.type === 'text')
        lesson =
          res.stop_reason !== 'refusal' && text?.type === 'text' ? parseLesson(text.text) : null
      } catch (err) {
        this.logger.warn(`Lesson generation failed: ${(err as Error).message}`)
      }
    }
    if (!lesson) {
      const reason = 'Could not write that lesson. Try again.'
      void this.failures.record(reason, 'no-lesson')
      throw new ServiceUnavailableException(reason)
    }
    return this.prisma.lesson.create({
      data: {
        skill: request.skill,
        level: request.level,
        title: lesson.title,
        scenes: lesson.scenes as unknown as object,
        status: request.review ? 'pending' : 'approved',
        model,
        promptVersion: LESSON_PROMPT_VERSION,
        ...usage,
      },
    })
  }

  /** A preview link's lesson, in any status. Reads only the library row: no use, no events. */
  private async previewed(token: { lessonId: string }): Promise<Lesson> {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: token.lessonId } })
    if (!lesson) throw new NotFoundException('This lesson is not available.')
    return lesson
  }

  /** The token's LessonUse, when it is still the learner's and its lesson can be shown. */
  private async playable(token: PlayerToken): Promise<UseWithLesson> {
    const use = await this.prisma.lessonUse.findUnique({
      where: { id: token.useId },
      include: { lesson: true },
    })
    if (
      !use ||
      use.userId !== token.sub ||
      use.cohortId !== token.cohortId ||
      use.itemId !== token.itemId ||
      use.sentBackAt !== null ||
      use.lesson.status !== 'approved'
    )
      throw new NotFoundException('This lesson is not available. Open it again from your course.')
    return use
  }
}

function contentView(lesson: Lesson, uses: LessonUse[]): LessonContentView {
  return {
    id: lesson.id,
    skill: lesson.skill,
    level: lesson.level,
    status: lesson.status as LessonContentView['status'],
    title: lesson.title,
    scenes: lesson.scenes as unknown as LessonScene[],
    model: lesson.model,
    promptVersion: lesson.promptVersion,
    tokens: {
      input: lesson.inputTokens,
      output: lesson.outputTokens,
      cacheRead: lesson.cacheReadTokens,
      cacheWrite: lesson.cacheWriteTokens,
    },
    createdAt: lesson.createdAt.toISOString(),
    reviewedAt: lesson.reviewedAt?.toISOString() ?? null,
    reviewedBy: lesson.reviewedBy,
    usedBy: uses.map((u) => ({
      userId: u.userId,
      itemId: u.itemId,
      at: u.createdAt.toISOString(),
    })),
  }
}
