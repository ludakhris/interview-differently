import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import type { PracticeSet } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { runAsSystem } from '../../core/tenant-context'
import {
  SqlRunnerService,
  type QueryOutcome,
  type QueryResult,
} from '../sql-runner/sql-runner.service'
import { compareResults, normalizeCell } from '../assessments/grade'
import { questionIndex } from '../assessments/parse-markdown'
import type { AssessmentSection } from '../assessments/assessment.types'
import {
  LIBRARY_LIMIT,
  libraryWhere,
  type LearnerSlot,
  type LibraryFilter,
  type LibraryPage,
  type PracticeContentView,
} from '../../core/practice-port'
import type {
  CheckpointHelp,
  CheckpointHelpKind,
  CheckpointPreview,
  CheckpointRun,
  CheckpointTable,
} from '../../core/checkpoint-types'
import {
  COACH_SYSTEM,
  GENERATE_SCHEMA,
  GENERATE_SYSTEM,
  HELP_SCHEMA,
  PRACTICE_PROMPT_VERSION,
  generatePrompt,
  helpPrompt,
  parseGenerated,
  parseHelp,
  ruleHint,
  type DraftTask,
} from './coach'

/** Coaching must feel instant, so it uses the fastest model; set CHECKPOINT_HELP_MODEL to change it. */
export const HELP_MODEL = process.env.CHECKPOINT_HELP_MODEL || 'claude-haiku-5-5'
/** Written content (practice, lessons) is checked against the data anyway; set CHECKPOINT_CONTENT_MODEL to change it. */
export const CONTENT_MODEL = process.env.CHECKPOINT_CONTENT_MODEL || 'claude-sonnet-5-5'
const PREVIEW_ROWS = 20
/** Generated task refs: `gen:<practiceSetId>:<n>`. */
export const GEN_PREFIX = 'gen:'
const SHAPE_CACHE_MAX = 2000

/** A request the learner can be given: from the bank, or from a generated practice set. */
export interface CheckpointQuestion {
  ref: string
  prompt: string
  from: string | null
  starterSql: string | null
  referenceSql: string
  ordered: boolean
  strictColumns: boolean
}

/** A generated task as stored on PracticeSet.tasks. */
export interface StoredTask {
  prompt: string
  referenceSql: string
  ordered: boolean
}

/** A wrong answer the practice should aim at. */
export interface PracticeMiss {
  prompt: string
  sql: string
  reason: string | null
}

export const genRef = (setId: string, n: number) => `${GEN_PREFIX}${setId}:${n}`

/** The tasks of a generated set as requests. */
export const setQuestions = (set: Pick<PracticeSet, 'id' | 'tasks'>): CheckpointQuestion[] =>
  (set.tasks as unknown as StoredTask[]).map((t, i) => ({
    ref: genRef(set.id, i),
    prompt: t.prompt,
    from: null,
    starterSql: null,
    referenceSql: t.referenceSql,
    ordered: t.ordered,
    strictColumns: false,
  }))

const preview = (r: QueryResult): CheckpointPreview => ({
  columns: r.columns,
  rows: r.rows.slice(0, PREVIEW_ROWS),
  rowCount: r.rowCount,
})

/** Tokens the Claude API reported for one call (the cache fields may be absent). */
interface Usage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

export interface TokenCounts {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Adds one call's usage to the running totals. */
export function addUsage(total: TokenCounts, u: Usage | undefined): TokenCounts {
  if (!u) return total
  return {
    inputTokens: total.inputTokens + (u.input_tokens ?? 0),
    outputTokens: total.outputTokens + (u.output_tokens ?? 0),
    cacheReadTokens: total.cacheReadTokens + (u.cache_read_input_tokens ?? 0),
    cacheWriteTokens: total.cacheWriteTokens + (u.cache_creation_input_tokens ?? 0),
  }
}

/**
 * The Simulator's checkpoint engine: questions from a question bank, grading on a fresh copy of the dataset (the same
 * comparison as assessments), coaching, and the generated practice library (PracticeSet). The chat checkpoint
 * (CheckpointChatService) drives it for one learner's slot.
 */
@Injectable()
export class CheckpointsService {
  private readonly logger = new Logger(CheckpointsService.name)
  private client: Anthropic | null | undefined
  /** The shape of an answer key's result, by bank version and ref: answer keys do not change under a version. */
  private readonly shapeCache = new Map<string, { columns: string[]; rowCount: number } | null>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: SqlRunnerService
  ) {}

  /** The Claude client, or null when no key is configured (coaching then falls back to fixed hints). */
  private ai(): Anthropic | null {
    if (this.client === undefined) {
      try {
        this.client = new Anthropic()
      } catch {
        this.client = null
      }
    }
    return this.client
  }

  async loadBank(slug: string) {
    const a = await this.prisma.assessment.findUnique({
      where: { slug },
      include: { dataset: { select: { setupSql: true, schemaSummary: true } } },
    })
    if (!a || !a.dataset) throw new NotFoundException('Question bank not found')
    return {
      id: a.id,
      slug: a.slug,
      version: a.updatedAt.toISOString(),
      index: questionIndex(a.sections as unknown as AssessmentSection[]),
      setupSql: a.dataset.setupSql,
      schema: a.dataset.schemaSummary as unknown as CheckpointTable[],
    }
  }

  /** The bank's SQL questions named by `refs`, in order; unknown refs and other question types are left out. */
  bankQuestions(bank: Awaited<ReturnType<CheckpointsService['loadBank']>>, refs: string[]) {
    return refs.flatMap((ref): CheckpointQuestion[] => {
      const q = bank.index.get(ref)
      return q && q.type === 'sql'
        ? [
            {
              ref,
              prompt: q.prompt,
              from: q.from ?? null,
              starterSql: q.starterSql ?? null,
              referenceSql: q.referenceSql,
              ordered: q.ordered,
              strictColumns: q.strictColumns,
            },
          ]
        : []
    })
  }

  /** One request by ref: a bank question or a generated task (whose set must be from this bank). */
  async question(slug: string, ref: string) {
    const bank = await this.loadBank(slug)
    if (ref.startsWith(GEN_PREFIX)) {
      const [, id, n] = ref.split(':')
      const set = id ? await this.prisma.practiceSet.findUnique({ where: { id } }) : null
      const q = set && set.bankSlug === slug ? setQuestions(set)[Number(n)] : undefined
      if (!q) throw new NotFoundException('Task not found')
      return { bank, q }
    }
    const [q] = this.bankQuestions(bank, [ref])
    if (!q) throw new NotFoundException('Task not found')
    return { bank, q }
  }

  /**
   * The shape of each request's right answer (column names and row count, never values), by running the answer
   * keys. Null for a key that does not run.
   */
  async shapes(
    bank: { slug: string; version: string; setupSql: string },
    qs: Pick<CheckpointQuestion, 'ref' | 'referenceSql'>[]
  ): Promise<({ columns: string[]; rowCount: number } | null)[]> {
    const key = (ref: string) => `${bank.slug}\u0001${bank.version}\u0001${ref}`
    const missing = qs.filter((q) => !this.shapeCache.has(key(q.ref)))
    if (missing.length > 0) {
      const outs = await this.runner.executeMany(
        bank.setupSql,
        missing.map((q) => q.referenceSql)
      )
      this.refuseInfra(outs)
      if (this.shapeCache.size + missing.length > SHAPE_CACHE_MAX) this.shapeCache.clear()
      outs.forEach((o, i) =>
        this.shapeCache.set(
          key(missing[i].ref),
          o.ok ? { columns: o.result.columns, rowCount: o.result.rowCount } : null
        )
      )
    }
    return qs.map((q) => this.shapeCache.get(key(q.ref)) ?? null)
  }

  /** A dry run: the learner's rows and, against a request, which of them are right. Nothing is recorded. */
  async run(slug: string, sql: string, ref?: string): Promise<CheckpointRun> {
    if (!sql.trim()) throw new BadRequestException('Write a query first')
    if (!ref) {
      const bank = await this.loadBank(slug)
      const [o] = await this.runner.executeMany(bank.setupSql, [sql])
      this.refuseInfra([o])
      return o.ok
        ? { preview: preview(o.result), error: null, check: null }
        : { preview: null, error: o.error, check: null }
    }
    const { bank, q } = await this.question(slug, ref)
    // The answer key runs first, as in grading.
    const [key, mine] = await this.runner.executeMany(bank.setupSql, [q.referenceSql, sql])
    this.refuseInfra([key, mine])
    if (!mine.ok) return { preview: null, error: mine.error, check: null }
    const shown = preview(mine.result)
    if (!key.ok) return { preview: shown, error: null, check: null }
    const rowKey = (r: unknown[]) => r.map(normalizeCell).join('\u0001')
    const right = new Set(key.result.rows.map(rowKey))
    const cmp = compareResults(mine.result, key.result, {
      ordered: q.ordered,
      strictColumns: q.strictColumns,
    })
    return {
      preview: shown,
      error: null,
      check: {
        correct: cmp.match,
        reason: cmp.reason ?? null,
        rowHits: shown.rows.map((r) => right.has(rowKey(r))),
        expected: { columns: key.result.columns, rowCount: key.result.rowCount },
      },
    }
  }

  /** Grading itself failing is nobody's wrong answer: refuse, so the learner can try again. */
  private refuseInfra(outcomes: QueryOutcome[]) {
    if (outcomes.some((o) => !o.ok && o.infra))
      throw new ServiceUnavailableException(
        'Grading is unavailable right now. Try again in a moment.'
      )
  }

  async grade(
    slug: string,
    ref: string,
    sql: string
  ): Promise<{
    correct: boolean
    reason: string | null
    error: string | null
    preview: CheckpointPreview | null
  }> {
    if (!sql.trim()) throw new BadRequestException('Write a query first')
    const { bank, q } = await this.question(slug, ref)
    // The answer key runs first: a learner's statement can end the transaction and change what follows.
    const [key, mine] = await this.runner.executeMany(bank.setupSql, [q.referenceSql, sql])
    this.refuseInfra([key, mine])
    if (!key.ok) throw new ServiceUnavailableException('This task cannot be graded right now.')
    if (!mine.ok) return { correct: false, reason: null, error: mine.error, preview: null }
    const cmp = compareResults(mine.result, key.result, {
      ordered: q.ordered,
      strictColumns: q.strictColumns,
    })
    return {
      correct: cmp.match,
      reason: cmp.reason ?? null,
      error: null,
      preview: preview(mine.result),
    }
  }

  async help(input: {
    bankSlug: string
    ref: string
    sql: string
    kind: CheckpointHelpKind
    skillLabel: string
  }): Promise<CheckpointHelp> {
    const { bank, q } = await this.question(input.bankSlug, input.ref)
    let outcome = 'the learner has not run anything yet'
    let fallback = ruleHint(null, null)
    if (input.sql.trim()) {
      const g = await this.grade(input.bankSlug, input.ref, input.sql)
      outcome = g.correct
        ? 'it is correct'
        : g.error
          ? `it failed with the error: ${g.error}`
          : `it ran but did not match: ${g.reason ?? 'rows differ'}`
      fallback = g.correct
        ? 'That one is right. Submit it to count it.'
        : ruleHint(g.reason, g.error)
    }
    const client = this.ai()
    if (client) {
      try {
        const res = await client.messages.create(
          {
            model: HELP_MODEL,
            max_tokens: 4000,
            system: COACH_SYSTEM,
            output_config: {
              effort: 'low',
              format: {
                type: 'json_schema',
                schema: HELP_SCHEMA as unknown as Record<string, unknown>,
              },
            },
            messages: [
              {
                role: 'user',
                content: helpPrompt({
                  kind: input.kind,
                  skillLabel: input.skillLabel,
                  task: q.prompt,
                  answerSql: q.referenceSql,
                  learnerSql: input.sql,
                  outcome,
                  schema: bank.schema,
                }),
              },
            ],
          },
          { timeout: 30_000, maxRetries: 1 }
        )
        const text = res.content.find((b) => b.type === 'text')
        const parsed =
          res.stop_reason !== 'refusal' && text?.type === 'text'
            ? parseHelp(text.text, q.referenceSql)
            : null
        if (parsed && (await this.givesAnswer(bank.setupSql, q, parsed.exampleSql)))
          return { kind: input.kind, text: fallback, exampleSql: null, source: 'rules' }
        if (parsed) return { kind: input.kind, ...parsed, source: res.model }
      } catch (err) {
        this.logger.warn(`Coaching failed: ${(err as Error).message}`)
      }
    }
    return { kind: input.kind, text: fallback, exampleSql: null, source: 'rules' }
  }

  /**
   * Whether a coaching example would hand over the answer: it returns the answer key's result on the dataset (the
   * key runs first, as in grading). Compared loosely (any order, any column names), so a reworded answer is caught
   * too. When it cannot be checked, it counts as giving the answer.
   */
  private async givesAnswer(
    setupSql: string,
    q: Pick<CheckpointQuestion, 'referenceSql'>,
    exampleSql: string | null
  ): Promise<boolean> {
    if (!exampleSql) return false
    try {
      const [key, example] = await this.runner.executeMany(setupSql, [q.referenceSql, exampleSql])
      if (!key.ok) return key.infra === true
      if (!example.ok) return example.infra === true
      return compareResults(example.result, key.result, { ordered: false, strictColumns: false })
        .match
    } catch (err) {
      this.logger.warn(`Coaching example not checked: ${(err as Error).message}`)
      return true
    }
  }

  /** Keeps the drafted tasks whose answer key runs and returns rows, without ever running learner SQL. */
  private async verified(
    setupSql: string,
    drafts: DraftTask[]
  ): Promise<{ kept: DraftTask[]; failed: { sql: string; why: string }[] }> {
    const outcomes = await this.runner.executeMany(
      setupSql,
      drafts.map((d) => d.referenceSql)
    )
    this.refuseInfra(outcomes)
    const kept: DraftTask[] = []
    const failed: { sql: string; why: string }[] = []
    drafts.forEach((d, i) => {
      const o = outcomes[i]
      if (o.ok && o.result.rowCount > 0 && !o.result.truncated) kept.push(d)
      else
        failed.push({
          sql: d.referenceSql,
          why: !o.ok
            ? `error: ${o.error}`
            : o.result.truncated
              ? 'too many rows'
              : 'returned no rows',
        })
    })
    return { kept, failed }
  }

  /**
   * Writes a practice set for a skill into the library. Every task's answer key runs on the bank's dataset first;
   * up to three drafts, each told which keys of the last one failed. Records the model, the prompt version and the
   * tokens of every draft call.
   */
  async writePractice(input: {
    bankSlug: string
    skill: string
    misses: PracticeMiss[]
    status: 'approved' | 'pending'
  }): Promise<PracticeSet> {
    const client = this.ai()
    if (!client)
      throw new ServiceUnavailableException(
        'Generated practice needs the AI service, which is not configured.'
      )
    const bank = await this.loadBank(input.bankSlug)
    const kept: DraftTask[] = []
    let failed: { sql: string; why: string }[] = []
    let intro = ''
    let model = CONTENT_MODEL
    let tokens: TokenCounts = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }
    // Up to three drafts. A task whose answer key fails on the data is never shown; the next draft is told which
    // failed and why, and good tasks from every draft are kept.
    for (let attempt = 0; attempt < 3 && kept.length < 2; attempt++) {
      try {
        const res = await client.messages.create(
          {
            model: CONTENT_MODEL,
            max_tokens: 8000,
            system: GENERATE_SYSTEM,
            output_config: {
              effort: 'medium',
              format: {
                type: 'json_schema',
                schema: GENERATE_SCHEMA as unknown as Record<string, unknown>,
              },
            },
            messages: [
              {
                role: 'user',
                content: generatePrompt({
                  skillLabel: input.skill,
                  schema: bank.schema,
                  misses: input.misses,
                  failed,
                }),
              },
            ],
          },
          { timeout: 60_000, maxRetries: 1 }
        )
        tokens = addUsage(tokens, res.usage)
        model = res.model || model
        const text = res.content.find((b) => b.type === 'text')
        const draft =
          res.stop_reason !== 'refusal' && text?.type === 'text' ? parseGenerated(text.text) : null
        if (!draft) {
          this.logger.warn(
            `Practice draft unusable (stop: ${res.stop_reason}): ${text?.type === 'text' ? text.text.slice(0, 300) : 'no text'}`
          )
          continue
        }
        const checked = await this.verified(bank.setupSql, draft.tasks)
        for (const t of checked.kept)
          if (kept.length < 3 && !kept.some((k) => k.prompt === t.prompt)) kept.push(t)
        failed = checked.failed
        intro ||= draft.intro
        if (checked.failed.length)
          this.logger.warn(
            `Practice draft: ${checked.kept.length} of ${draft.tasks.length} answer keys ran and returned rows`
          )
      } catch (err) {
        if (err instanceof ServiceUnavailableException) throw err
        this.logger.warn(`Practice generation failed: ${(err as Error).message}`)
      }
    }
    if (kept.length < 2)
      throw new ServiceUnavailableException('Could not make practice that checks out. Try again.')
    return this.prisma.practiceSet.create({
      data: {
        bankSlug: input.bankSlug,
        skill: input.skill,
        status: input.status,
        intro,
        tasks: kept as unknown as object,
        model,
        promptVersion: PRACTICE_PROMPT_VERSION,
        ...tokens,
      },
    })
  }

  /**
   * Fills a learner's practice slot. A set a person approved for this bank and skill that this learner has not had
   * in this cohort, and that was not sent back in this cohort, is reused; only when there is none is a new one written
   * (held for review when `review`).
   */
  async practiceForSlot(
    slot: LearnerSlot,
    p: { bankSlug: string; skill: string; review: boolean },
    misses: () => Promise<PracticeMiss[]>
  ): Promise<PracticeSet> {
    const reuse = await this.prisma.practiceSet.findFirst({
      where: {
        bankSlug: p.bankSlug,
        skill: p.skill,
        status: 'approved',
        reviewedBy: { not: null },
        uses: {
          none: {
            cohortId: slot.cohortId,
            OR: [{ userId: slot.userId }, { sentBackAt: { not: null } }],
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    const set =
      reuse ??
      (await this.writePractice({
        bankSlug: p.bankSlug,
        skill: p.skill,
        misses: await misses(),
        status: p.review ? 'pending' : 'approved',
      }))
    await this.prisma.practiceSetUse.create({
      data: {
        practiceSetId: set.id,
        cohortId: slot.cohortId,
        userId: slot.userId,
        itemId: slot.itemId,
      },
    })
    return set
  }

  private contentView(
    set: PracticeSet,
    uses: { userId: string; itemId: string; createdAt: Date }[]
  ): PracticeContentView {
    return {
      id: set.id,
      bankSlug: set.bankSlug,
      skill: set.skill,
      status: set.status as PracticeContentView['status'],
      intro: set.intro,
      tasks: (set.tasks as unknown as StoredTask[]).map((t) => t.prompt),
      model: set.model,
      promptVersion: set.promptVersion,
      tokens: {
        input: set.inputTokens,
        output: set.outputTokens,
        cacheRead: set.cacheReadTokens,
        cacheWrite: set.cacheWriteTokens,
      },
      createdAt: set.createdAt.toISOString(),
      reviewedAt: set.reviewedAt?.toISOString() ?? null,
      reviewedBy: set.reviewedBy,
      usedBy: uses.map((u) => ({
        userId: u.userId,
        itemId: u.itemId,
        at: u.createdAt.toISOString(),
      })),
    }
  }

  /**
   * Generated practice used in a cohort (newest first), with who it was used for there (that cohort only). Practice
   * sent back for the cohort leaves this list; its uses stay, as history.
   */
  async practiceInCohort(cohortId: string): Promise<PracticeContentView[]> {
    const uses = await this.prisma.practiceSetUse.findMany({
      where: { cohortId, sentBackAt: null },
      include: { practiceSet: true },
      orderBy: { createdAt: 'asc' },
    })
    const bySet = new Map<string, { set: PracticeSet; uses: typeof uses }>()
    for (const u of uses) {
      const entry = bySet.get(u.practiceSetId) ?? { set: u.practiceSet, uses: [] }
      entry.uses.push(u)
      bySet.set(u.practiceSetId, entry)
    }
    return [...bySet.values()]
      .sort((a, b) => b.set.createdAt.getTime() - a.set.createdAt.getTime())
      .map((e) => this.contentView(e.set, e.uses))
  }

  /**
   * Staff of `cohortId` review practice their learners were given (PracticePort.review). Approving approves a pending
   * library row. Sending back marks this cohort's uses of it sent back (kept, as history): those learners get new
   * practice on their next visit and the set is not reused in this cohort. The library row is rejected only when no
   * other cohort has a use not sent back. The view lists this cohort's live uses only.
   */
  async review(
    practiceSetId: string,
    approve: boolean,
    reviewerId: string,
    cohortId: string
  ): Promise<PracticeContentView> {
    const found = await this.prisma.practiceSet.findUnique({ where: { id: practiceSetId } })
    const usedHere = found
      ? await this.prisma.practiceSetUse.count({
          where: { practiceSetId, cohortId, sentBackAt: null },
        })
      : 0
    if (!found || usedHere === 0) throw new NotFoundException('Practice not found')
    const reviewed = { reviewedBy: reviewerId, reviewedAt: new Date() }
    let set = found
    if (approve) {
      // A pending row, or one shown without review that no person has approved yet (a person's approval is what lets
      // the library reuse it). A rejected one stays rejected; an approved one keeps its first reviewer.
      const changed = await this.prisma.practiceSet.updateMany({
        where: {
          id: practiceSetId,
          OR: [{ status: 'pending' }, { status: 'approved', reviewedBy: null }],
        },
        data: { status: 'approved', ...reviewed },
      })
      if (changed.count > 0)
        set = (await this.prisma.practiceSet.findUnique({ where: { id: practiceSetId } })) ?? found
    } else {
      await this.prisma.practiceSetUse.updateMany({
        where: { practiceSetId, cohortId, sentBackAt: null },
        data: { sentBackAt: new Date() },
      })
      // Other cohorts may sit in other agencies, which this caller cannot see: count them as the system. Only a
      // number comes back.
      const elsewhere = await runAsSystem(() =>
        this.prisma.practiceSetUse.count({
          where: { practiceSetId, cohortId: { not: cohortId }, sentBackAt: null },
        })
      )
      if (elsewhere === 0)
        set = await this.prisma.practiceSet.update({
          where: { id: practiceSetId },
          data: { status: 'rejected', ...reviewed },
        })
    }
    const uses = await this.prisma.practiceSetUse.findMany({
      where: { practiceSetId, cohortId, sentBackAt: null },
      orderBy: { createdAt: 'asc' },
    })
    return this.contentView(set, uses)
  }

  /**
   * The practice library for a system admin (PracticePort.library), newest first, with how many rows match. The LMS
   * checks the caller is one; the request then reads as every agency, so the uses listed are those in every cohort
   * (less those sent back).
   */
  async library(filter: LibraryFilter): Promise<LibraryPage<PracticeContentView>> {
    const where = libraryWhere(filter)
    const [sets, total] = await Promise.all([
      this.prisma.practiceSet.findMany({
        where,
        include: { uses: { where: { sentBackAt: null }, orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        take: LIBRARY_LIMIT,
      }),
      this.prisma.practiceSet.count({ where }),
    ])
    return { rows: sets.map((s) => this.contentView(s, s.uses)), total }
  }

  /**
   * A system admin's library decision (PracticePort.curate). Approving sets 'approved' and the reviewer, which makes
   * the set reusable for any learner. Rejecting sets 'rejected' and the reviewer: it is no longer shown or reused,
   * and its learners are given new practice on their next visit. Uses are kept, as the record of who had it.
   */
  async curate(
    practiceSetId: string,
    approve: boolean,
    reviewerId: string
  ): Promise<PracticeContentView> {
    const found = await this.prisma.practiceSet.findUnique({ where: { id: practiceSetId } })
    if (!found) throw new NotFoundException('Practice not found')
    const set = await this.prisma.practiceSet.update({
      where: { id: practiceSetId },
      data: {
        status: approve ? 'approved' : 'rejected',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      },
      include: { uses: { where: { sentBackAt: null }, orderBy: { createdAt: 'asc' } } },
    })
    return this.contentView(set, set.uses)
  }
}
