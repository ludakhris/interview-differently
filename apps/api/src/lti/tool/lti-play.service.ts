import { randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { compareResults } from '../../assessments/grade'
import { SqlRunnerService, type QueryResult } from '../../sql-runner/sql-runner.service'
import {
  fieldsOf,
  firstNodeId,
  gradeQuant,
  scoreRun,
  type BandSpec,
  type QuantFieldResult,
  type Run,
  type SimNode,
  type SimScenario,
} from '../../scoring/sim-scoring'
import { LtiError } from '../lti-spec'
import { LTI_STORE } from '../lti-store'
import type { LtiStore } from '../lti-store'
import type { LtiSession } from './lti-session'
import { LtiToolService } from './lti-tool.service'

const RATE_WINDOW_S = 60
const PLAY_PER_MINUTE_PER_LEARNER = 60
/** The state outlives the session by this long, so a late score retry still finds it. */
const STATE_GRACE_S = 60
/** Long enough for a SQL answer to be graded while it holds the lock. */
const LOCK_TTL_S = 60
const LOCK_TRIES = 20
const LOCK_WAIT_MS = 100
const MAX_SQL_CHARS = 20_000
const CHANGED = 'This simulation was changed while you were in it. Relaunch it from your course.'
const MAX_VARIABLES = 50
const MAX_NAME_CHARS = 100
const MAX_REASON_CHARS = 300
/** Rows of the expected output sent back after a SQL answer (what the browser grid shows). */
const EXPECTED_ROWS = 500

/** What the server remembers about one launched play. Nothing in it comes from the client's scoring. */
interface PlayState {
  /** The node the learner is on: a decision, quant or sql node, or the feedback node when done. */
  node: string
  choices: Record<string, string>
  /** The nodes answered by choice, in play order (the store's JSON does not keep key order). */
  choiceOrder: string[]
  quant: Record<string, { answer: QuantAnswerIn; results: QuantFieldResult[] }>
  sql: Record<string, { sql: string; correct: boolean }>
  hints: string[]
  /** Set once the result row exists, so a retried hand-back reuses it. */
  resultId?: string
}

interface QuantAnswerIn {
  value?: number
  fields?: Record<string, number>
  variables?: Record<string, number>
}

/** What a reload needs to pick the play up again: the position and the answers given so far. */
export interface PlayView {
  node: string
  done: boolean
  choices: Record<string, string>
  quant: Record<string, QuantAnswerIn>
  sql: Record<string, { sql: string }>
  hints: string[]
}

export interface PlayStep {
  /** The node to show next. */
  next: string
  done: boolean
}

export interface QuantReveal {
  acceptedRange: BandSpec
  modelAnswer: number
  derivation?: string
}

export interface QuantGrade extends PlayStep {
  results: QuantFieldResult[]
  /** The answer key for each field, shown now that the answer is in. */
  reveal: Record<string, QuantReveal>
}

export interface SqlGrade extends PlayStep {
  correct: boolean
  reason?: string
  expected: Pick<QueryResult, 'columns' | 'rows' | 'rowCount' | 'command'>
  referenceSql: string
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Runs a launched text simulation on the server (#63): the learner's browser shows the case and
 * sends each answer here; the server grades it, remembers it, and decides the score. The browser
 * never holds the answer key and never sends a score. One play per LTI session: each node is
 * answered once, in order, and a reload resumes where it was.
 */
@Injectable()
export class LtiPlayService {
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
  now: () => number = () => Date.now()

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: SqlRunnerService,
    private readonly tool: LtiToolService,
    @Inject(LTI_STORE) private readonly store: LtiStore
  ) {}

  // ── Reads ────────────────────────────────────────────────────────────────

  async view(session: LtiSession): Promise<PlayView> {
    await this.limit(session)
    const scenario = await this.scenario(session)
    const state = await this.resume(session, scenario)
    return {
      node: state.node,
      done: this.typeOf(scenario, state.node) === 'feedback',
      choices: state.choices,
      quant: Object.fromEntries(Object.entries(state.quant).map(([id, q]) => [id, q.answer])),
      sql: Object.fromEntries(Object.entries(state.sql).map(([id, s]) => [id, { sql: s.sql }])),
      hints: state.hints,
    }
  }

  // ── Answers ──────────────────────────────────────────────────────────────

  choose(session: LtiSession, nodeId: unknown, choiceId: unknown): Promise<PlayStep> {
    return this.answering(session, nodeId, 'decision', async ({ scenario, node, state }) => {
      const choice =
        typeof choiceId === 'string' ? node.choices?.find((c) => c.id === choiceId) : undefined
      if (!choice) throw new LtiError('That is not one of the choices', 400)
      state.choices[node.nodeId] = choice.id
      state.choiceOrder.push(node.nodeId)
      return this.advance(scenario, state, choice.nextNodeId)
    })
  }

  grantQuant(session: LtiSession, nodeId: unknown, answer: unknown): Promise<QuantGrade> {
    return this.answering(session, nodeId, 'quant', async ({ scenario, node, state }) => {
      const { clean, values } = this.parseQuant(node, answer)
      const results = gradeQuant(node, values)
      state.quant[node.nodeId] = { answer: clean, results }
      const step = this.advance(scenario, state, node.nextNodeId)
      const reveal = Object.fromEntries(
        fieldsOf(node).map((f) => [
          f.id,
          {
            acceptedRange: f.acceptedRange,
            modelAnswer: f.modelAnswer,
            ...(f.derivation ? { derivation: f.derivation } : {}),
          },
        ])
      )
      return { ...step, results, reveal }
    })
  }

  gradeSql(session: LtiSession, nodeId: unknown, sql: unknown): Promise<SqlGrade> {
    return this.answering(session, nodeId, 'sql', async ({ scenario, node, state }) => {
      const spec = node.sql!
      if (typeof sql !== 'string' || !sql.trim() || sql.length > MAX_SQL_CHARS)
        throw new LtiError('Enter a query to submit', 400)
      const dataset = await this.prisma.dataset.findUnique({
        where: { slug: spec.datasetSlug },
        select: { setupSql: true },
      })
      if (!dataset) throw new LtiError('This question could not be graded', 503)
      let outcomes
      try {
        // the reference runs first: a student statement can change the data later queries see
        outcomes = await this.runner.executeMany(dataset.setupSql, [spec.referenceSql, sql.trim()])
      } catch {
        throw new LtiError('This question could not be graded. Please try again.', 503)
      }
      const [reference, student] = outcomes
      // a broken reference is an authoring fault: it must not cost the learner their one answer
      if (!reference.ok) throw new LtiError('This question could not be graded', 503)
      let correct = false
      let reason: string | undefined
      if (!student.ok) reason = student.error.slice(0, MAX_REASON_CHARS)
      else {
        const cmp = compareResults(student.result, reference.result, {
          ordered: !!spec.ordered,
          strictColumns: !!spec.strictColumns,
        })
        correct = cmp.match
        reason = cmp.reason
      }
      state.sql[node.nodeId] = { sql: sql.trim(), correct }
      const step = this.advance(scenario, state, node.nextNodeId)
      const { columns, rows, rowCount, command } = reference.result
      return {
        ...step,
        correct,
        ...(reason ? { reason } : {}),
        expected: { columns, rows: rows.slice(0, EXPECTED_ROWS), rowCount, command },
        referenceSql: spec.referenceSql,
      }
    })
  }

  /** Reveals the hint on the node the learner is on, and records that it was used. */
  async hint(session: LtiSession, nodeId: unknown): Promise<{ hint: string; footnote?: string }> {
    await this.limit(session)
    return this.locked(session, async (held) => {
      const scenario = await this.scenario(session)
      const state = await this.resume(session, scenario)
      const node = this.current(scenario, state, nodeId)
      const spec = node.type === 'quant' ? node.quant : node.type === 'sql' ? node.sql : undefined
      const hint = spec?.hint
      if (!hint) throw new LtiError('There is no hint for this question', 404)
      if (!state.hints.includes(node.nodeId)) state.hints.push(node.nodeId)
      await held()
      await this.save(session, state)
      const footnote = node.type === 'quant' ? node.quant?.hintFootnote : undefined
      return { hint, ...(footnote ? { footnote } : {}) }
    })
  }

  // ── Finishing ────────────────────────────────────────────────────────────

  /**
   * Scores the finished play from what the server recorded, stores the result and posts the
   * score. Safe to repeat: a retry after a failed post reuses the stored result.
   */
  async complete(session: LtiSession): Promise<{ score: number; returnUrl: string }> {
    await this.limit(session)
    const resultId = await this.locked(session, async (held) => {
      const scenario = await this.scenario(session)
      const state = await this.load(session)
      if (!state || this.typeOf(scenario, state.node) !== 'feedback')
        throw new LtiError('Finish the simulation before sending your score', 400)
      if (state.resultId) return state.resultId
      const run: Run = {
        choices: state.choices,
        quant: Object.fromEntries(Object.entries(state.quant).map(([id, q]) => [id, q.results])),
        sql: Object.fromEntries(Object.entries(state.sql).map(([id, s]) => [id, s.correct])),
        hints: state.hints,
      }
      const { dimensionScores, overallScore } = scoreRun(scenario, run)
      const id = randomUUID()
      // no result row unless this request still owns the play: a retry would add a second one
      await held()
      await this.prisma.simulationResult.create({
        data: {
          id,
          userId: session.sub,
          scenarioId: scenario.scenarioId,
          scenarioTitle: scenario.title,
          track: scenario.track,
          completedAt: new Date(this.now()),
          overallScore,
          choiceSequence: state.choiceOrder.map((nodeId) => state.choices[nodeId]),
          dimensionScores: {
            create: dimensionScores.map((d) => ({
              dimension: d.dimension,
              score: d.score,
              quality: d.quality,
              feedback: d.feedback,
            })),
          },
        },
      })
      state.resultId = id
      await held()
      await this.save(session, state)
      return id
    })
    return this.tool.complete(session, resultId)
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /** The shared shape of an answer: right node, right kind, once, in order, under the lock. */
  private async answering<T extends PlayStep>(
    session: LtiSession,
    nodeId: unknown,
    kind: SimNode['type'],
    grade: (c: { scenario: SimScenario; node: SimNode; state: PlayState }) => Promise<T>
  ): Promise<T> {
    await this.limit(session)
    return this.locked(session, async (held) => {
      const scenario = await this.scenario(session)
      const state = await this.resume(session, scenario)
      const node = this.current(scenario, state, nodeId)
      if (node.type !== kind) throw new LtiError('That is not the kind of question shown', 400)
      const out = await grade({ scenario, node, state })
      await held()
      await this.save(session, state)
      return out
    })
  }

  /** The node the learner is on, which must be the one named. */
  private current(scenario: SimScenario, state: PlayState, nodeId: unknown): SimNode {
    if (this.typeOf(scenario, state.node) === 'feedback')
      throw new LtiError('This simulation is finished. Send your score.', 409)
    if (typeof nodeId !== 'string' || nodeId !== state.node)
      throw new LtiError('That question is not the current one', 409)
    const node = scenario.nodes.find((n) => n.nodeId === nodeId)
    if (!node) throw new LtiError(CHANGED, 409)
    // a scenario whose graph loops back must not let a node be answered twice
    if (state.choices[nodeId] !== undefined || state.quant[nodeId] || state.sql[nodeId])
      throw new LtiError('That question was already answered', 409)
    return node
  }

  /** Moves the play to the next node, past any narrative-only transitions. */
  private advance(scenario: SimScenario, state: PlayState, next: string | undefined): PlayStep {
    state.node = this.settle(scenario, next)
    return { next: state.node, done: this.typeOf(scenario, state.node) === 'feedback' }
  }

  private settle(scenario: SimScenario, from: string | undefined): string {
    let id = from
    for (let hops = 0; hops <= scenario.nodes.length; hops++) {
      const node = scenario.nodes.find((n) => n.nodeId === id)
      if (!node) break
      if (node.type !== 'transition') return node.nodeId
      id = node.nextNodeId
    }
    throw new LtiError('This scenario is not set up correctly', 500)
  }

  private fresh(scenario: SimScenario): PlayState {
    return {
      node: this.settle(scenario, firstNodeId(scenario.nodes)),
      choices: {},
      choiceOrder: [],
      quant: {},
      sql: {},
      hints: [],
    }
  }

  private typeOf(scenario: SimScenario, nodeId: string): SimNode['type'] | undefined {
    return scenario.nodes.find((n) => n.nodeId === nodeId)?.type
  }

  /** The play, refused (not crashed) when the author has since removed the node it is on. */
  private async resume(session: LtiSession, scenario: SimScenario): Promise<PlayState> {
    const state = await this.load(session)
    if (!state) return this.fresh(scenario)
    if (this.typeOf(scenario, state.node) === undefined) throw new LtiError(CHANGED, 409)
    return state
  }

  /** Reads a quant answer: every field a finite number (and, optionally, the formula variables). */
  private parseQuant(
    node: SimNode,
    raw: unknown
  ): { clean: QuantAnswerIn; values: Record<string, number> } {
    const bad = () => new LtiError('Enter a number for every field', 400)
    if (!isRecord(raw)) throw bad()
    const fields = fieldsOf(node)
    const values: Record<string, number> = {}
    const clean: QuantAnswerIn = {}
    if (node.quant?.variant === 'numeric-range') {
      if (!finite(raw.value)) throw bad()
      values[fields[0].id] = raw.value
      clean.value = raw.value
    } else {
      if (!isRecord(raw.fields)) throw bad()
      for (const f of fields) {
        const v = raw.fields[f.id]
        if (!finite(v)) throw bad()
        values[f.id] = v
      }
      clean.fields = { ...values }
    }
    if (raw.variables !== undefined) {
      if (!isRecord(raw.variables)) throw bad()
      const entries = Object.entries(raw.variables)
      if (entries.length > MAX_VARIABLES) throw bad()
      clean.variables = {}
      for (const [k, v] of entries) {
        if (!finite(v) || k.length > MAX_NAME_CHARS) throw bad()
        clean.variables[k] = v
      }
    }
    return { clean, values }
  }

  private async scenario(session: LtiSession): Promise<SimScenario> {
    const row = await this.prisma.scenario.findUnique({ where: { scenarioId: session.ref } })
    if (!row || row.status !== 'published') throw new LtiError('Scenario not found', 404)
    const data = row.data as unknown as Partial<SimScenario> | null
    if (!data || !Array.isArray(data.nodes) || !data.rubric?.dimensions?.length)
      throw new LtiError('This scenario is not set up correctly', 500)
    return { ...data, scenarioId: row.scenarioId } as SimScenario
  }

  private ttl(session: LtiSession): number {
    return Math.max(1, Math.ceil(session.exp - this.now() / 1000) + STATE_GRACE_S)
  }

  private load(session: LtiSession): Promise<PlayState | null> {
    return this.store.peek<PlayState>('lti-play', session.jti)
  }

  private save(session: LtiSession, state: PlayState): Promise<void> {
    return this.store.put('lti-play', session.jti, state, this.ttl(session))
  }

  /**
   * One request at a time per play, so two quick submits cannot both grade the same node. The lock
   * carries an owner token: a request whose lock has expired (a grade that ran past the TTL) must not
   * save over the request that took it next, nor release that request's lock. `held` throws unless
   * this request still holds the lock; call it before saving.
   */
  private async locked<T>(
    session: LtiSession,
    fn: (held: () => Promise<void>) => Promise<T>
  ): Promise<T> {
    for (let i = 0; i < LOCK_TRIES; i++) {
      if (await this.store.claim('lti-play-lock', session.jti, LOCK_TTL_S)) {
        const token = randomUUID()
        await this.store.put('lti-play-lock', session.jti, token, LOCK_TTL_S)
        const mine = async () =>
          (await this.store.peek<string>('lti-play-lock', session.jti)) === token
        try {
          return await fn(async () => {
            if (!(await mine())) throw new LtiError('That took too long. Please try again.', 503)
          })
        } finally {
          if (await mine()) await this.store.release('lti-play-lock', session.jti)
        }
      }
      await this.sleep(LOCK_WAIT_MS)
    }
    throw new LtiError('Another request is in progress. Please try again.', 503)
  }

  private async limit(session: LtiSession) {
    if (
      (await this.store.count('rl:tool-play', session.sub, RATE_WINDOW_S)) >
      PLAY_PER_MINUTE_PER_LEARNER
    )
      throw new LtiError('Too many requests. Wait a minute and try again.', 429)
  }
}
