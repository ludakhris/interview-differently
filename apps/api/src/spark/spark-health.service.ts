import { Injectable, Logger } from '@nestjs/common'
import type { RecentFailures } from '../core/service-failure-log'
import type { SparkStatus, StatusPort } from '../core/status-port'
import { LessonFailureLog } from './lesson-failure-log'
import { linkSetupProblems, playerWebUrl } from './player-token'
import { SparkService } from './spark.service'

/** How long the player check's answer is reused, so calling the endpoint often costs nothing (GitHub issue #92). */
export const PLAYER_CHECK_TTL_MS = 5 * 60 * 1000
/** How long the player has to answer before it counts as failing. */
export const PLAYER_TIMEOUT_MS = 5_000

type PlayerCheck = SparkStatus['player']

/** GET /health/videos/setup, in full: the setup and the player together. */
export interface VideosHealth {
  status: 'ok' | 'failing'
  checkedAt: string
}

/**
 * Spark's health (GitHub issue #92): whether lessons (which play like videos) are set up, whether the player's web
 * address answers (cached), and the lessons learners could not get (from LessonFailureLog); all of it for the LMS's
 * System status page, as Spark's status port.
 */
@Injectable()
export class SparkHealthService implements StatusPort<SparkStatus> {
  private readonly logger = new Logger(SparkHealthService.name)
  private last: { at: number; check: PlayerCheck } | null = null
  private running: Promise<PlayerCheck> | null = null
  now: () => number = () => Date.now()
  fetch: typeof fetch = (input, init) => fetch(input, init)
  timeoutMs = PLAYER_TIMEOUT_MS

  constructor(
    private readonly spark: SparkService,
    private readonly failures: LessonFailureLog
  ) {}

  /** From the server's configuration only, no outside call: the AI client, and in production the link settings. */
  setup(): SparkStatus['setup'] {
    const problems = [
      ...(this.spark.aiConfigured()
        ? []
        : ['The AI service that writes lessons is not configured (ANTHROPIC_API_KEY).']),
      ...linkSetupProblems(),
    ]
    return { status: problems.length ? 'failing' : 'ok', problems }
  }

  /**
   * Whether the player's page answers: GET <player address>/lesson. 'not-set-up' (no call) when there is no address (production without SPARK_WEB_URL). The
   * last answer is reused for five minutes; one check is shared by everyone who asks while it runs.
   */
  player(): Promise<PlayerCheck> {
    // the address links really use: outside production that is the local player when none is set
    const url = playerWebUrl()
    if (!url)
      return Promise.resolve({
        status: 'not-set-up',
        reason: null,
        checkedAt: new Date(this.now()).toISOString(),
      })
    if (this.last && this.now() - this.last.at < PLAYER_CHECK_TTL_MS)
      return Promise.resolve(this.last.check)
    this.running ??= this.runPlayer(`${url}/lesson`).finally(() => (this.running = null))
    return this.running
  }

  /** GET /health/videos/setup: ok only when lessons are set up and the player answers. */
  async videos(): Promise<VideosHealth> {
    const setup = this.setup()
    const player = await this.player()
    return {
      status: setup.status === 'ok' && player.status === 'ok' ? 'ok' : 'failing',
      checkedAt: player.checkedAt,
    }
  }

  /** Lessons learners could not get in the last 15 minutes, from the table, so a deploy does not reset them. */
  recentFailures(): Promise<RecentFailures> {
    return this.failures.recent()
  }

  async status(): Promise<SparkStatus> {
    const [player, lessons] = await Promise.all([this.player(), this.failures.history()])
    return { setup: this.setup(), player, lessons }
  }

  private async runPlayer(url: string): Promise<PlayerCheck> {
    const started = this.now()
    const done = (status: PlayerCheck['status'], reason: string | null): PlayerCheck => ({
      status,
      reason,
      checkedAt: new Date(started).toISOString(),
    })
    let check: PlayerCheck
    try {
      const res = await this.fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      // only the status matters: let the body go
      await res.body?.cancel().catch(() => undefined)
      check = res.ok
        ? done('ok', null)
        : done('failing', `The video player answered ${res.status}.`)
    } catch (err) {
      const e = err as Error
      check =
        e.name === 'TimeoutError' || e.name === 'AbortError'
          ? done(
              'failing',
              `The video player did not answer within ${this.timeoutMs / 1000} seconds.`
            )
          : done('failing', `Could not reach the video player: ${e.message}`)
    }
    if (check.status === 'failing') this.logger.error(`Video player check failed: ${check.reason}`)
    this.last = { at: started, check }
    return check
  }
}
