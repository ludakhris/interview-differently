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

  /**
   * One failed request is tried once more before the check counts as failing: the answer is kept for five minutes, so
   * a single dropped request would otherwise mark videos down until the next check.
   */
  private async runPlayer(url: string): Promise<PlayerCheck> {
    const started = this.now()
    let attempt = await this.askPlayer(url)
    if (attempt.status === 'failing') {
      this.logger.warn(`Video player check failed, trying once more: ${attempt.reason}`)
      attempt = await this.askPlayer(url)
    }
    const check: PlayerCheck = { ...attempt, checkedAt: new Date(started).toISOString() }
    if (check.status === 'failing') this.logger.error(`Video player check failed: ${check.reason}`)
    this.last = { at: started, check }
    return check
  }

  private async askPlayer(url: string): Promise<Omit<PlayerCheck, 'checkedAt'>> {
    try {
      const res = await this.fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      // only the status matters: let the body go
      await res.body?.cancel().catch(() => undefined)
      return res.ok
        ? { status: 'ok', reason: null }
        : { status: 'failing', reason: `The video player answered ${res.status}.` }
    } catch (err) {
      const e = err as Error
      return {
        status: 'failing',
        reason:
          e.name === 'TimeoutError' || e.name === 'AbortError'
            ? `The video player did not answer within ${this.timeoutMs / 1000} seconds.`
            : `Could not reach the video player: ${e.message}`,
      }
    }
  }
}
