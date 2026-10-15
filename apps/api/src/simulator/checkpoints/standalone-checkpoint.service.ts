import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ClerkService } from '../../auth/clerk.service'
import { LTI_STORE, type LtiStore } from '../../lti/lti-store'
import type {
  CheckpointAnswerResult,
  CheckpointHelp,
  CheckpointRun,
  CheckpointSimulation,
  CheckpointStart,
  CheckpointView,
} from '../../core/checkpoint-types'
import type { AssessmentSection } from '../assessments/assessment.types'
import { questionIndex } from '../assessments/parse-markdown'
import { CheckpointChatService, type CheckpointContext } from './checkpoint-chat.service'
import { samePlacement, type SimulatorPlacement } from './checkpoint-placement'
import { STANDALONE_COHORT_ID } from './standalone-cohort'

const RATE_WINDOW_S = 60
/** Per learner and minute, as for an LTI checkpoint session. Help calls the model, so it is tighter. */
const LIMITS = { view: 120, run: 60, answer: 30, help: 20, start: 30 } as const
/** A placement names at most this many requests (see parsePlacement). */
const MAX_REQUESTS = 50
const MAX_TITLE = 300
const MAX_SLUG = 300

/** The line the chat opens with when the bank does not set one. */
export const DEFAULT_SCENARIO =
  'A few colleagues need data from you today. Answer each request with a query.'

/** The slot's item (and the delivery's label) for a bank's standalone simulation. */
export const standaloneItemId = (bankSlug: string) => `standalone:${bankSlug}`

type Body = Record<string, unknown>
const bodyOf = (b: unknown): Body =>
  typeof b === 'object' && b !== null && !Array.isArray(b) ? (b as Body) : {}

/** Each question's skill on the competency profile: its section's `> competency:` name, else the section title. */
function skillByRef(sections: unknown): Map<string, string> {
  const m = new Map<string, string>()
  for (const s of (Array.isArray(sections) ? sections : []) as AssessmentSection[])
    for (const q of s.questions) m.set(q.id, s.competency ?? s.title)
  return m
}

/**
 * A bank's standalone simulation, made by the Simulator from the bank itself: every SQL question in order, no
 * diagnostic, the bank's title, and one answer per request (a query sent to a colleague is sent; the chat moves on).
 * Null when no SQL question has a sender (`> from:`), which is what makes a bank a chat.
 */
export function placementFromBank(bank: {
  slug: string
  title: string
  sections: unknown
}): SimulatorPlacement | null {
  const sections = (Array.isArray(bank.sections) ? bank.sections : []) as AssessmentSection[]
  const sql = [...questionIndex(sections).values()].filter((q) => q.type === 'sql')
  if (!sql.some((q) => q.type === 'sql' && q.from)) return null
  return {
    bankSlug: bank.slug,
    refs: sql.slice(0, MAX_REQUESTS).map((q) => q.id),
    title: bank.title.slice(0, MAX_TITLE),
    scenario: DEFAULT_SCENARIO,
    diagnostic: false,
    oneAnswer: true,
    practice: null,
  }
}

/**
 * The chat simulation for a signed-in learner in standalone Interview Differently (GitHub issue #90): the same
 * CheckpointChatService an LTI launch uses (grading, coaching, events, done and score), on the slot (standalone
 * cohort, the learner, `standalone:<bank>`). Only banks the learner may use: platform-wide ones and their own
 * institutions'. No score goes anywhere: there is no course to send it to.
 */
@Injectable()
export class StandaloneCheckpointService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: CheckpointChatService,
    private readonly clerk: ClerkService,
    @Inject(LTI_STORE) private readonly store: LtiStore
  ) {}

  private async limit(userId: string, scope: keyof typeof LIMITS): Promise<void> {
    if (
      (await this.store.count(`rl:me-checkpoint-${scope}`, userId, RATE_WINDOW_S)) > LIMITS[scope]
    )
      throw new HttpException('Too many requests. Wait a minute and try again.', 429)
  }

  /** Platform-wide banks and the learner's own institutions' (every bank for a platform admin). */
  private async visibleWhere(userId: string) {
    if (await this.clerk.isAdmin(userId)) return {}
    return {
      OR: [{ institutionId: null }, { institution: { memberships: { some: { userId } } } }],
    }
  }

  /** The work simulations the learner can open, with how far they got in each. */
  async list(userId: string): Promise<CheckpointSimulation[]> {
    const banks = await this.prisma.assessment.findMany({
      where: { datasetId: { not: null }, ...(await this.visibleWhere(userId)) },
      orderBy: { title: 'asc' },
      select: { slug: true, title: true, sections: true },
    })
    const sims = banks.flatMap((b) => {
      const placement = placementFromBank(b)
      return placement ? [{ ...placement, skillOf: skillByRef(b.sections) }] : []
    })
    if (sims.length === 0) return []
    const events = await this.prisma.practiceEvent.findMany({
      where: {
        cohortId: STANDALONE_COHORT_ID,
        userId,
        kind: 'answer',
        itemId: { in: sims.map((p) => standaloneItemId(p.bankSlug)) },
      },
      orderBy: { createdAt: 'asc' },
      select: { itemId: true, ref: true, correct: true },
    })
    // the latest answer per request wins, as in the chat
    const latest = new Map<string, boolean>()
    for (const e of events) latest.set(`${e.itemId}\u0001${e.ref}`, e.correct === true)
    return sims.map((p) => {
      const item = standaloneItemId(p.bankSlug)
      const states = p.refs.map((r) => latest.get(`${item}\u0001${r}`))
      const answered = states.filter((s) => s !== undefined).length
      const done = answered === p.refs.length
      const right = states.filter((s) => s === true).length
      // per skill, the share of its answered requests that were right
      const bySkill = new Map<string, boolean[]>()
      p.refs.forEach((r, i) => {
        const skill = p.skillOf.get(r)
        if (skill === undefined || states[i] === undefined) return
        bySkill.set(skill, [...(bySkill.get(skill) ?? []), states[i]])
      })
      return {
        bankSlug: p.bankSlug,
        title: p.title,
        requests: p.refs.length,
        answered,
        done,
        scorePct: done ? Math.round((right / p.refs.length) * 100) : null,
        competencies: Array.from(bySkill, ([name, rights]) => ({
          name,
          score: Math.round((rights.filter(Boolean).length / rights.length) * 100),
        })),
      }
    })
  }

  /** Opens a bank's simulation: its delivery on the standalone cohort, made on first use and kept in step with the bank. */
  async start(userId: string, b: unknown): Promise<CheckpointStart> {
    await this.limit(userId, 'start')
    const slug = bodyOf(b).bankSlug
    if (typeof slug !== 'string' || !slug || slug.length > MAX_SLUG)
      throw new BadRequestException('bankSlug is required')
    const bank = await this.prisma.assessment.findFirst({
      where: { slug, datasetId: { not: null }, ...(await this.visibleWhere(userId)) },
      select: { slug: true, title: true, sections: true },
    })
    const placement = bank ? placementFromBank(bank) : null
    if (!placement) throw new NotFoundException('Simulation not found')
    const cohortId = STANDALONE_COHORT_ID
    const itemId = standaloneItemId(placement.bankSlug)
    const deliveryId = await this.chat.deliveryFor({ cohortId, userId, itemId }, placement, itemId)
    return { deliveryId }
  }

  /**
   * The learner's slot on a standalone delivery; anything else (a course's delivery, a bank they lost, a bank that is
   * no longer a chat) is a 404. The placement is made from the bank as it is now, as start() and the list make it, and
   * the delivery's stored copy is brought in step when it differs, so a bookmarked page and the dashboard agree.
   */
  private async ctx(
    userId: string,
    deliveryId: string,
    scope: keyof typeof LIMITS
  ): Promise<CheckpointContext> {
    await this.limit(userId, scope)
    const d = await this.prisma.assessmentDelivery.findFirst({
      where: {
        id: deliveryId,
        cohortId: STANDALONE_COHORT_ID,
        assessment: await this.visibleWhere(userId),
      },
      select: {
        label: true,
        config: true,
        assessment: { select: { slug: true, title: true, sections: true } },
      },
    })
    const placement = d ? placementFromBank(d.assessment) : null
    if (!d || !placement || d.label !== standaloneItemId(d.assessment.slug))
      throw new NotFoundException('Simulation not found')
    if (!samePlacement(d.config, placement))
      await this.prisma.assessmentDelivery.update({
        where: { id: deliveryId },
        data: { config: placement as unknown as object },
      })
    return {
      slot: { cohortId: STANDALONE_COHORT_ID, userId, itemId: d.label },
      deliveryId,
      placement,
    }
  }

  async view(userId: string, deliveryId: string): Promise<CheckpointView> {
    return this.chat.view(await this.ctx(userId, deliveryId, 'view'))
  }

  async run(userId: string, deliveryId: string, b: unknown): Promise<CheckpointRun> {
    const body = bodyOf(b)
    return this.chat.run(await this.ctx(userId, deliveryId, 'run'), {
      ref: body.ref,
      sql: body.sql,
    })
  }

  async answer(userId: string, deliveryId: string, b: unknown): Promise<CheckpointAnswerResult> {
    const body = bodyOf(b)
    return this.chat.answer(await this.ctx(userId, deliveryId, 'answer'), {
      ref: body.ref,
      sql: body.sql,
      pass: body.pass,
    })
  }

  async help(userId: string, deliveryId: string, b: unknown): Promise<CheckpointHelp> {
    const body = bodyOf(b)
    return this.chat.help(await this.ctx(userId, deliveryId, 'help'), {
      ref: body.ref,
      sql: body.sql,
      kind: body.kind,
    })
  }
}
