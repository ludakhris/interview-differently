import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { PracticeSet, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import type {
  CheckpointPlacement,
  LearnerSlot,
  PracticeContentView,
  PracticePort,
} from '../../core/practice-port'
import { stillAsked } from '../../core/practice-port'
import type {
  CheckpointAnswerResult,
  CheckpointAnswerState,
  CheckpointHelp,
  CheckpointHelpKind,
  CheckpointPractice,
  CheckpointPreview,
  CheckpointRun,
  CheckpointTable,
  CheckpointView,
} from '../../core/checkpoint-types'
import { CheckpointsService, setQuestions, type CheckpointQuestion } from './checkpoints.service'
import {
  UNKNOWN_REFS_MESSAGE,
  parsePlacement,
  samePlacement,
  type SimulatorPlacement,
} from './checkpoint-placement'

export const MAX_SQL_CHARS = 20_000
const HELP_KINDS: CheckpointHelpKind[] = ['hint', 'explain', 'example']
const MISSES_FOR_PRACTICE = 8
/** Rows of a sent query kept with the answer, for the learner's reply in the chat. */
export const STORED_PREVIEW_ROWS = 10
const ANSWERED_MESSAGE = 'You have answered this one'

/** One learner's checkpoint: their slot, the delivery it is recorded on, and what the course asked for. */
export interface CheckpointContext {
  slot: LearnerSlot
  deliveryId: string
  placement: SimulatorPlacement
}

/** The label of the delivery that carries an LMS item's checkpoint (the same one an LTI launch uses). */
export const deliveryLabel = (itemId: string) => `lti:${itemId}`

const practiceStatus = (set: PracticeSet | null): CheckpointPractice['status'] =>
  !set
    ? 'writing'
    : set.status === 'approved'
      ? 'ready'
      : set.status === 'rejected'
        ? 'rejected'
        : 'pending'

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** A stored preview read back, or null when it is missing or not one. */
function previewOf(v: unknown): CheckpointPreview | null {
  if (!v || typeof v !== 'object') return null
  const p = v as Record<string, unknown>
  if (!Array.isArray(p.columns) || !Array.isArray(p.rows) || typeof p.rowCount !== 'number')
    return null
  return {
    columns: p.columns.map(String),
    rows: p.rows.filter(Array.isArray) as unknown[][],
    rowCount: p.rowCount,
  }
}

/**
 * Each request takes exactly one answer, and a run shows only the learner's own rows: in a diagnostic (a retry
 * could turn a finished checkpoint back to unfinished, and row-by-row checks would let a learner find the key's rows
 * before deciding to pass) and in a standalone work simulation (`oneAnswer`: a sent query is sent, as at work). Never
 * a practice slot, and never a regular course checkpoint, whose retries are how a learner closes a gap.
 */
const isOneAnswer = (p: SimulatorPlacement) => (p.diagnostic || p.oneAnswer === true) && !p.practice

/**
 * The chat checkpoint (GitHub issue #90): colleagues' requests one at a time, each answer graded on the server and
 * recorded as a PracticeEvent, coaching on request, and generated practice for a practice slot. Driven by a slot and
 * its delivery, from the LTI page (lti/tool) or from the LMS demo autoplay (the PracticePort it also provides).
 */
@Injectable()
export class CheckpointChatService implements PracticePort {
  /** One practice set is being made per slot at a time (a double click must not write two). */
  private readonly making = new Map<string, Promise<unknown>>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: CheckpointsService
  ) {}

  // ── context ─────────────────────────────────────────────────────────────────

  /** The checkpoint on a delivery, for a learner in its cohort; refuses a delivery made to another cohort. */
  async contextOf(
    deliveryId: string,
    cohortId: string,
    userId: string,
    itemId: string
  ): Promise<CheckpointContext> {
    const d = await this.prisma.assessmentDelivery.findUnique({
      where: { id: deliveryId },
      select: { id: true, cohortId: true, config: true, assessment: { select: { slug: true } } },
    })
    const placement = d ? parsePlacement(d.config) : null
    if (!d || d.cohortId !== cohortId || !placement || placement.bankSlug !== d.assessment.slug)
      throw new NotFoundException('Checkpoint not found')
    return { slot: { cohortId, userId, itemId }, deliveryId: d.id, placement }
  }

  /**
   * The delivery for a slot's checkpoint, made on first use; its stored placement follows the course's. `label`:
   * a course item's is `lti:<item>` (the one its LTI launch uses); standalone Interview Differently names its own.
   */
  async deliveryFor(
    slot: LearnerSlot,
    placement: SimulatorPlacement,
    label = deliveryLabel(slot.itemId)
  ): Promise<string> {
    const bank = await this.prisma.assessment.findUnique({
      where: { slug: placement.bankSlug },
      select: { id: true },
    })
    if (!bank) throw new NotFoundException('Question bank not found')
    const where = {
      assessmentId: bank.id,
      cohortId: slot.cohortId,
      label,
    }
    const found = await this.prisma.assessmentDelivery.findFirst({
      where,
      orderBy: { createdAt: 'asc' },
      select: { id: true, config: true },
    })
    if (!found) {
      const created = await this.prisma.assessmentDelivery.create({
        data: { ...where, config: placement as unknown as object },
        select: { id: true },
      })
      return created.id
    }
    if (!samePlacement(found.config, placement))
      await this.prisma.assessmentDelivery.update({
        where: { id: found.id },
        data: { config: placement as unknown as object },
      })
    return found.id
  }

  // ── what the learner sees ───────────────────────────────────────────────────

  /**
   * The slot's newest practice set, for a practice slot. Null when it has none, or when its newest was sent back by
   * course staff (the slot then needs another set).
   */
  private async slotSet(slot: LearnerSlot): Promise<PracticeSet | null> {
    const use = await this.prisma.practiceSetUse.findFirst({
      where: { cohortId: slot.cohortId, userId: slot.userId, itemId: slot.itemId },
      orderBy: { createdAt: 'desc' },
      include: { practiceSet: true },
    })
    return use && !use.sentBackAt ? use.practiceSet : null
  }

  /** The requests the learner is given (none yet for a practice slot whose set is not ready). */
  private async requests(ctx: CheckpointContext) {
    const bank = await this.engine.loadBank(ctx.placement.bankSlug)
    if (!ctx.placement.practice) {
      // A diagnostic stops asking a group after a miss or a pass (CheckpointPlacement.groups).
      const asked = ctx.placement.groups
        ? stillAsked(
            ctx.placement.refs,
            ctx.placement.groups,
            await this.answers(ctx, ctx.placement.refs)
          )
        : ctx.placement.refs
      return {
        bank,
        questions: this.engine.bankQuestions(bank, asked),
        practice: null,
      }
    }
    const set = await this.slotSet(ctx.slot)
    const status = practiceStatus(set)
    const practice: CheckpointPractice = {
      status,
      skill: ctx.placement.practice.skill,
      intro: set?.intro ?? null,
    }
    return {
      bank,
      questions: status === 'ready' && set ? setQuestions(set) : [],
      practice,
    }
  }

  /** The learner's latest answer per request, with how often they tried and asked for help. */
  private async answers(
    ctx: CheckpointContext,
    refs: string[]
  ): Promise<Record<string, CheckpointAnswerState>> {
    if (refs.length === 0) return {}
    const events = await this.prisma.practiceEvent.findMany({
      where: {
        cohortId: ctx.slot.cohortId,
        userId: ctx.slot.userId,
        itemId: ctx.slot.itemId,
        ref: { in: refs },
      },
      orderBy: { createdAt: 'asc' },
      select: { kind: true, ref: true, correct: true, passed: true, data: true },
    })
    const out: Record<string, CheckpointAnswerState> = {}
    const helps = new Map<string, number>()
    for (const e of events) {
      if (e.kind === 'help') {
        helps.set(e.ref, (helps.get(e.ref) ?? 0) + 1)
        continue
      }
      if (e.kind !== 'answer') continue
      const d = (e.data ?? {}) as Record<string, unknown>
      out[e.ref] = {
        correct: e.correct === true,
        passed: e.passed,
        sql: str(d.sql),
        preview: previewOf(d.preview),
        reason: str(d.reason),
        error: str(d.error),
        tries: (out[e.ref]?.tries ?? 0) + 1,
        helps: 0,
      }
    }
    for (const [ref, n] of helps) if (out[ref]) out[ref].helps = n
    return out
  }

  /** Done once every request has an answer (right, wrong or passed); the score is the share answered right. */
  static progress(
    refs: string[],
    answers: Record<string, CheckpointAnswerState>
  ): { done: boolean; scorePct: number | null } {
    const done = refs.length > 0 && refs.every((r) => answers[r])
    if (!done) return { done, scorePct: null }
    const right = refs.filter((r) => answers[r].correct).length
    return { done, scorePct: Math.round((right / refs.length) * 100) }
  }

  /** Done and the score, without running anything. */
  async score(ctx: CheckpointContext): Promise<{ done: boolean; scorePct: number | null }> {
    const { questions } = await this.requests(ctx)
    const refs = questions.map((q) => q.ref)
    return CheckpointChatService.progress(refs, await this.answers(ctx, refs))
  }

  async view(ctx: CheckpointContext): Promise<CheckpointView> {
    const { bank, questions, practice } = await this.requests(ctx)
    const refs = questions.map((q) => q.ref)
    const [shapes, answers] = await Promise.all([
      this.engine.shapes(bank, questions),
      this.answers(ctx, refs),
    ])
    return {
      deliveryId: ctx.deliveryId,
      title: ctx.placement.title,
      scenario: ctx.placement.scenario,
      diagnostic: ctx.placement.diagnostic,
      oneAnswer: isOneAnswer(ctx.placement),
      schema: bank.schema as CheckpointTable[],
      tasks: questions.map((q, i) => ({
        ref: q.ref,
        prompt: q.prompt,
        from: q.from,
        starterSql: q.starterSql,
        expected: shapes[i],
      })),
      answers,
      practice,
      ...CheckpointChatService.progress(refs, answers),
    }
  }

  /** A request the learner was given; anything else (another bank question, another set) is refused. */
  private async given(ctx: CheckpointContext, ref: unknown): Promise<CheckpointQuestion> {
    if (typeof ref !== 'string' || !ref) throw new BadRequestException('Missing ref')
    const { questions } = await this.requests(ctx)
    const q = questions.find((x) => x.ref === ref)
    if (!q) throw new NotFoundException('Task not found')
    return q
  }

  private sqlOf(sql: unknown, required: boolean): string {
    if (sql === undefined && !required) return ''
    if (typeof sql !== 'string') throw new BadRequestException('Missing sql')
    if (sql.length > MAX_SQL_CHARS)
      throw new BadRequestException(`Keep the query under ${MAX_SQL_CHARS} characters`)
    if (required && !sql.trim()) throw new BadRequestException('Write a query first')
    return sql
  }

  // ── what the learner does ───────────────────────────────────────────────────

  /** A dry run, checked against a request when `ref` names one. Nothing is recorded. */
  async run(
    ctx: CheckpointContext,
    input: { ref?: unknown; sql?: unknown }
  ): Promise<CheckpointRun> {
    const sql = this.sqlOf(input.sql, true)
    if (input.ref === undefined || input.ref === null || input.ref === '')
      return this.engine.run(ctx.placement.bankSlug, sql)
    const q = await this.given(ctx, input.ref)
    // Where each request takes one answer (a diagnostic, a work simulation), a run shows the learner their own rows
    // only, never how they compare with the answer; elsewhere the check is a teaching aid.
    if (isOneAnswer(ctx.placement)) return this.engine.run(ctx.placement.bankSlug, sql)
    return this.engine.run(ctx.placement.bankSlug, sql, q.ref)
  }

  /**
   * An answer, graded here, or a pass (a diagnostic only). Recorded as the request's latest answer. In a diagnostic or
   * a work simulation a request already answered (right, wrong or passed) cannot be answered again (see isOneAnswer).
   */
  async answer(
    ctx: CheckpointContext,
    input: { ref?: unknown; sql?: unknown; pass?: unknown }
  ): Promise<CheckpointAnswerResult> {
    const q = await this.given(ctx, input.ref)
    if (input.pass !== undefined && typeof input.pass !== 'boolean')
      throw new BadRequestException('pass must be true or false')
    const pass = input.pass === true
    if (pass && !ctx.placement.diagnostic)
      throw new BadRequestException('Only a diagnostic request can be passed')
    const oneAnswer = isOneAnswer(ctx.placement)
    if (oneAnswer && (await this.answers(ctx, [q.ref]))[q.ref])
      throw new ConflictException(ANSWERED_MESSAGE)
    const graded = pass
      ? { correct: false, reason: null, error: null, preview: null }
      : await this.engine.grade(ctx.placement.bankSlug, q.ref, this.sqlOf(input.sql, true))
    const event: Prisma.PracticeEventUncheckedCreateInput = {
      ...ctx.slot,
      deliveryId: ctx.deliveryId,
      kind: 'answer',
      ref: q.ref,
      correct: graded.correct,
      passed: pass,
      data: {
        sql: pass ? null : (input.sql as string),
        preview: graded.preview
          ? ({
              ...graded.preview,
              rows: graded.preview.rows.slice(0, STORED_PREVIEW_ROWS),
            } as Prisma.InputJsonObject)
          : null,
        reason: graded.reason,
        error: graded.error,
      },
    }
    if (oneAnswer) await this.recordOnlyAnswer(ctx, q.ref, event)
    else await this.prisma.practiceEvent.create({ data: event })
    return { ...graded, view: await this.view(ctx) }
  }

  /**
   * Records the request's one answer, unless another got there first (two tabs, a double send): grading ran outside
   * the transaction (it is slow), so the check is made again here under a lock held for this learner's request until
   * the transaction ends. The lock key is a hash of the slot and ref, passed as a parameter.
   */
  private async recordOnlyAnswer(
    ctx: CheckpointContext,
    ref: string,
    event: Prisma.PracticeEventUncheckedCreateInput
  ): Promise<void> {
    const { cohortId, userId, itemId } = ctx.slot
    const key = `practice-answer\u0001${cohortId}\u0001${userId}\u0001${itemId}\u0001${ref}`
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
      const existing = await tx.practiceEvent.findFirst({
        where: { cohortId, userId, itemId, ref, kind: 'answer' },
        select: { id: true },
      })
      if (existing) throw new ConflictException(ANSWERED_MESSAGE)
      await tx.practiceEvent.create({ data: event })
    })
  }

  /** Coaching on a request (a hint, another explanation, or a worked example), recorded. */
  async help(
    ctx: CheckpointContext,
    input: { ref?: unknown; sql?: unknown; kind?: unknown }
  ): Promise<CheckpointHelp> {
    const q = await this.given(ctx, input.ref)
    if (!HELP_KINDS.includes(input.kind as CheckpointHelpKind))
      throw new BadRequestException('kind must be hint, explain or example')
    const kind = input.kind as CheckpointHelpKind
    const sql = this.sqlOf(input.sql, false)
    const help = await this.engine.help({
      bankSlug: ctx.placement.bankSlug,
      ref: q.ref,
      // Where a request takes one answer, coaching never grades the draft against the key (it would say whether the
      // draft is right before it is sent): it coaches on the request only.
      sql: isOneAnswer(ctx.placement) ? '' : sql,
      kind,
      skillLabel: ctx.placement.practice?.skill ?? ctx.placement.title,
    })
    await this.prisma.practiceEvent.create({
      data: {
        ...ctx.slot,
        deliveryId: ctx.deliveryId,
        kind: 'help',
        ref: q.ref,
        data: {
          kind: help.kind,
          text: help.text,
          exampleSql: help.exampleSql,
          source: help.source,
        },
      },
    })
    return help
  }

  /** What this learner got wrong (not passed) on the practice's evidence requests in this cohort. */
  private async misses(ctx: CheckpointContext) {
    const refs = ctx.placement.practice?.evidenceRefs ?? []
    if (refs.length === 0) return []
    const [events, bank] = await Promise.all([
      this.prisma.practiceEvent.findMany({
        where: {
          cohortId: ctx.slot.cohortId,
          userId: ctx.slot.userId,
          kind: 'answer',
          correct: false,
          passed: false,
          ref: { in: refs },
        },
        orderBy: { createdAt: 'desc' },
        take: MISSES_FOR_PRACTICE,
        select: { ref: true, data: true },
      }),
      this.engine.loadBank(ctx.placement.bankSlug),
    ])
    const prompts = new Map(this.engine.bankQuestions(bank, refs).map((q) => [q.ref, q.prompt]))
    return events.flatMap((e) => {
      const d = (e.data ?? {}) as Record<string, unknown>
      const prompt = prompts.get(e.ref)
      return prompt
        ? [{ prompt, sql: str(d.sql) ?? '', reason: str(d.reason) ?? str(d.error) }]
        : []
    })
  }

  /** Fills a practice slot (reusing approved practice first); a slot that already has live practice keeps it. */
  async practice(ctx: CheckpointContext): Promise<CheckpointView> {
    const p = ctx.placement.practice
    if (!p) throw new BadRequestException('This checkpoint has no practice to write')
    const key = `${ctx.slot.cohortId}:${ctx.slot.userId}:${ctx.slot.itemId}`
    const inFlight = this.making.get(key)
    if (inFlight) await inFlight.catch(() => undefined)
    else {
      // In the map before the first await, slot check included, so a second request waits for this one.
      const work = (async () => {
        const current = await this.slotSet(ctx.slot)
        if (!current || current.status === 'rejected')
          await this.engine.practiceForSlot(
            ctx.slot,
            { bankSlug: ctx.placement.bankSlug, skill: p.skill, review: p.review },
            () => this.misses(ctx)
          )
      })()
      this.making.set(key, work)
      try {
        await work
      } finally {
        if (this.making.get(key) === work) this.making.delete(key)
      }
    }
    return this.view(ctx)
  }

  // ── PracticePort: staff screens and the demo autoplay ───────────────────────

  async bank(bankSlug: string, refs: string[]) {
    const bank = await this.engine.loadBank(bankSlug)
    return {
      schema: bank.schema,
      tasks: this.engine
        .bankQuestions(bank, refs)
        .map((q) => ({ ref: q.ref, prompt: q.prompt, from: q.from })),
    }
  }

  practiceInCohort(cohortId: string): Promise<PracticeContentView[]> {
    return this.engine.practiceInCohort(cohortId)
  }

  review(practiceSetId: string, approve: boolean, reviewerId: string, cohortId: string) {
    return this.engine.review(practiceSetId, approve, reviewerId, cohortId)
  }

  library(filter: Parameters<PracticePort['library']>[0]) {
    return this.engine.library(filter)
  }

  curate(practiceSetId: string, approve: boolean, reviewerId: string) {
    return this.engine.curate(practiceSetId, approve, reviewerId)
  }

  /** Refuses a placement whose refs are not all SQL questions in its bank (as an LTI launch does). */
  private async checkRefs(placement: CheckpointPlacement): Promise<void> {
    if (placement.refs.length === 0) return
    const bank = await this.engine.loadBank(placement.bankSlug)
    if (this.engine.bankQuestions(bank, placement.refs).length !== placement.refs.length)
      throw new ConflictException(UNKNOWN_REFS_MESSAGE)
  }

  private async demoContext(
    slot: LearnerSlot,
    placement: CheckpointPlacement
  ): Promise<CheckpointContext> {
    await this.checkRefs(placement)
    return { slot, placement, deliveryId: await this.deliveryFor(slot, placement) }
  }

  async demoAnswer(
    slot: LearnerSlot,
    placement: CheckpointPlacement,
    input: { ref: string; sql?: string; pass?: boolean }
  ) {
    const r = await this.answer(await this.demoContext(slot, placement), input)
    return { correct: r.correct, done: r.view.done, scorePct: r.view.scorePct }
  }

  async demoHelp(
    slot: LearnerSlot,
    placement: CheckpointPlacement,
    input: { ref: string; sql: string; kind: CheckpointHelpKind }
  ): Promise<void> {
    await this.help(await this.demoContext(slot, placement), input)
  }

  async demoPractice(slot: LearnerSlot, placement: CheckpointPlacement) {
    const v = await this.practice(await this.demoContext(slot, placement))
    const status = v.practice?.status
    return {
      status: status === 'ready' || status === 'rejected' ? status : ('pending' as const),
      refs: v.tasks.map((t) => t.ref),
    }
  }

  async demoForget(cohortId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return
    const where = { cohortId, userId: { in: userIds } }
    await this.prisma.practiceEvent.deleteMany({ where })
    await this.prisma.practiceSetUse.deleteMany({ where })
  }
}
