import { Inject, Injectable } from '@nestjs/common'
import { LTI_STORE, type LtiStore } from '../lti-store'
import { LtiError } from '../lti-spec'
import {
  CheckpointChatService,
  type CheckpointContext,
} from '../../simulator/checkpoints/checkpoint-chat.service'
import type {
  CheckpointAnswerResult,
  CheckpointHelp,
  CheckpointRun,
  CheckpointView,
} from '../../core/checkpoint-types'
import type { LtiSession } from './lti-session'
import { LtiToolService } from './lti-tool.service'

const RATE_WINDOW_S = 60
/** Per learner and minute. Help and practice call the model, so they are tighter. */
const LIMITS = { view: 120, run: 60, answer: 30, help: 20, practice: 5 } as const

type Body = Record<string, unknown>
const bodyOf = (b: unknown): Body =>
  typeof b === 'object' && b !== null && !Array.isArray(b) ? (b as Body) : {}

/**
 * The checkpoint page's API under an LTI checkpoint session (GitHub issue #90). The session names the delivery,
 * cohort and item; nothing in a request can point elsewhere. When the checkpoint is done, and whenever its score
 * changes after that, the score goes back to the course by AGS (checked again on every view of a done checkpoint).
 */
@Injectable()
export class LtiCheckpointService {
  constructor(
    private readonly chat: CheckpointChatService,
    private readonly tool: LtiToolService,
    @Inject(LTI_STORE) private readonly store: LtiStore
  ) {}

  private async ctx(session: LtiSession, scope: keyof typeof LIMITS): Promise<CheckpointContext> {
    const c = session.checkpoint
    if (!c) throw new LtiError('This session is not for a checkpoint', 403)
    if (
      (await this.store.count(`rl:tool-checkpoint-${scope}`, session.sub, RATE_WINDOW_S)) >
      LIMITS[scope]
    )
      throw new LtiError('Too many requests. Wait a minute and try again.', 429)
    return this.chat.contextOf(c.deliveryId, c.cohortId, session.sub, c.itemId)
  }

  /** The page; a finished checkpoint's score is sent again if a post after its last answer failed. */
  async view(session: LtiSession): Promise<CheckpointView> {
    const ctx = await this.ctx(session, 'view')
    const view = await this.chat.view(ctx)
    if (view.done) await this.syncScore(session, ctx)
    return view
  }

  /** Never sends the same score twice (syncCheckpointScore keeps the last one sent), so it is safe on every view. */
  private syncScore(session: LtiSession, ctx: CheckpointContext): Promise<void> {
    return this.tool.syncCheckpointScore(session, async () => (await this.chat.score(ctx)).scorePct)
  }

  async run(session: LtiSession, b: unknown): Promise<CheckpointRun> {
    const body = bodyOf(b)
    return this.chat.run(await this.ctx(session, 'run'), { ref: body.ref, sql: body.sql })
  }

  async answer(session: LtiSession, b: unknown): Promise<CheckpointAnswerResult> {
    const body = bodyOf(b)
    const ctx = await this.ctx(session, 'answer')
    const result = await this.chat.answer(ctx, { ref: body.ref, sql: body.sql, pass: body.pass })
    if (result.view.done) await this.syncScore(session, ctx)
    return result
  }

  async help(session: LtiSession, b: unknown): Promise<CheckpointHelp> {
    const body = bodyOf(b)
    return this.chat.help(await this.ctx(session, 'help'), {
      ref: body.ref,
      sql: body.sql,
      kind: body.kind,
    })
  }

  async practice(session: LtiSession): Promise<CheckpointView> {
    return this.chat.practice(await this.ctx(session, 'practice'))
  }
}
