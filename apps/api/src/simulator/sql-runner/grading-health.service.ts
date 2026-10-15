import { Injectable, Logger } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RecentFailures } from '../../core/service-failure-log'
import type { SimulatorStatus, StatusPort } from '../../core/status-port'
import { GradingFailureLog } from './grading-failure-log'
import { HEADROOM_MB, SqlRunnerBusyError, SqlRunnerService } from './sql-runner.service'

/** How long one check's answer is reused, so calling the endpoint often costs nothing (GitHub issue #92). */
export const GRADING_CHECK_TTL_MS = 5 * 60 * 1000
/**
 * A "busy" answer (every grading slot taken by learners) is reused too, for less time, so a flood of requests during a
 * busy spell cannot keep a place in the queue for grading slots that learners are waiting in.
 */
export const BUSY_CHECK_TTL_MS = 60 * 1000
/** The practice dataset learners are graded on, as checked in (the seed loads the same file). */
const DATASET = join(__dirname, '../../../prisma/datasets/sql-fundamentals.sql')

export interface GradingHealth {
  status: 'ok' | 'failing' | 'busy'
  /** Why grading failed; null when it worked. */
  reason: string | null
  /** The most memory a grading process held with the dataset loaded, in MB; null where it cannot be read. */
  peakMb: number | null
  limitMb: number
  checkedAt: string
  ms: number
}

/**
 * Grading's health (GitHub issue #92): the self-test (cached), the failures learners hit (from GradingFailureLog), and
 * both together for the LMS's System status page, as the Skill Simulator's status port.
 */
@Injectable()
export class GradingHealthService implements StatusPort<SimulatorStatus> {
  private readonly logger = new Logger(GradingHealthService.name)
  private last: { at: number; ttl: number; health: GradingHealth } | null = null
  private running: Promise<GradingHealth> | null = null
  now: () => number = () => Date.now()

  constructor(
    private readonly runner: SqlRunnerService,
    private readonly failures: GradingFailureLog
  ) {}

  /** Learner grading failures in the last 15 minutes, from the table, so a deploy does not reset them. */
  recentFailures(): Promise<RecentFailures> {
    return this.failures.recent()
  }

  async status(): Promise<SimulatorStatus> {
    const [health, history] = await Promise.all([this.check(), this.failures.history()])
    const { status, reason, peakMb, limitMb, checkedAt } = health
    return { grading: { selfTest: { status, reason, peakMb, limitMb, checkedAt }, ...history } }
  }

  /** The last answer while it is fresh; otherwise one check, shared by everyone who asks while it runs. */
  check(): Promise<GradingHealth> {
    if (this.last && this.now() - this.last.at < this.last.ttl)
      return Promise.resolve(this.last.health)
    this.running ??= this.run().finally(() => (this.running = null))
    return this.running
  }

  private async run(): Promise<GradingHealth> {
    const started = this.now()
    let peakMb: number | null = null
    let limitMb = this.runner.limits.maxRssMb
    const done = (status: GradingHealth['status'], reason: string | null): GradingHealth => ({
      status,
      reason,
      peakMb: peakMb === null ? null : Math.round(peakMb),
      limitMb,
      checkedAt: new Date(started).toISOString(),
      ms: this.now() - started,
    })
    let health: GradingHealth
    try {
      const fit = await this.runner.measure(readFileSync(DATASET, 'utf8'))
      ;({ peakMb, limitMb } = fit)
      health = !fit.ok
        ? done('failing', fit.error)
        : fit.peakMb !== null && fit.peakMb > fit.limitMb - HEADROOM_MB
          ? done(
              'failing',
              `Grading memory is low: a process holds ${Math.round(fit.peakMb)} MB of its ${fit.limitMb} MB limit with the dataset loaded`
            )
          : done('ok', null)
    } catch (err) {
      health =
        err instanceof SqlRunnerBusyError
          ? done('busy', null)
          : done('failing', (err as Error).message)
    }
    if (health.status === 'failing')
      this.logger.error(`Grading health check failed: ${health.reason}`)
    const ttl = health.status === 'busy' ? BUSY_CHECK_TTL_MS : GRADING_CHECK_TTL_MS
    this.last = { at: started, ttl, health }
    return health
  }
}
