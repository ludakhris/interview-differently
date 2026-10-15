import { Logger } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'
import type { FailureHistory } from './status-port'

/** How long a learner's failure counts as recent, for the /health/.../recent-failures checks (GitHub issue #92). */
export const FAILURE_WINDOW_MS = 15 * 60 * 1000
/** Failures older than this are deleted. */
export const FAILURE_KEEP_MS = 30 * 24 * 60 * 60 * 1000
/** The System status page shows this many hours of failures, and lists at most STATUS_LIST of them. */
export const STATUS_WINDOW_HOURS = 24
const STATUS_LIST = 20
/** Old rows are deleted on a write at most this often, so a burst of failures does not double its writes. */
const PRUNE_EVERY_MS = 60 * 60 * 1000
/** A reason longer than this is cut (they are short messages; this only bounds a row). */
const MAX_REASON = 500

/** The products that keep failures, as the ServiceFailure table's CHECK allows. */
export type FailureService = 'grading' | 'lessons'

/** A failure a learner hit through no fault of their own. */
export interface FailureRow<K extends string> {
  at: Date
  reason: string
  kind: K
}

/** What a public /health/.../recent-failures check reads: whether learners hit failures in the last 15 minutes. */
export interface RecentFailures {
  status: 'ok' | 'failing'
  failures: number
  windowMinutes: number
  /** The most recent one; null when there were none. */
  latest: { at: string; reason: string } | null
}

/**
 * One product's learner failures, kept in the ServiceFailure table (GitHub issue #92) so the health checks and the
 * System status page survive a deploy. Each product subclasses it in its own folder with its own `service` and
 * kinds, and reads and writes only its own rows. Not a tenant table: a row has no learner or agency, and the API
 * writes it for a learner of any agency (the tenant context does not apply to it, see PrismaService).
 */
export abstract class ServiceFailureLog<K extends string> {
  private readonly logger: Logger
  private prunedAt = Number.NEGATIVE_INFINITY
  now: () => number = () => Date.now()

  protected constructor(
    private readonly prisma: PrismaService,
    private readonly service: FailureService,
    /** The kinds this product writes; the first stands in for any unknown one read back. */
    private readonly kinds: readonly [K, ...K[]]
  ) {
    this.logger = new Logger(`ServiceFailureLog:${service}`)
  }

  /**
   * Records a failure. Callers do not await it, so the learner's request is never slowed; the promise never rejects
   * (a database error is logged and the failure is lost). Deletes this product's rows older than FAILURE_KEEP_MS at
   * most once an hour.
   */
  async record(reason: string, kind: K): Promise<void> {
    try {
      const at = this.now()
      await this.prisma.serviceFailure.create({
        data: {
          at: new Date(at),
          service: this.service,
          kind,
          reason: reason.slice(0, MAX_REASON),
        },
      })
      if (at - this.prunedAt >= PRUNE_EVERY_MS) {
        this.prunedAt = at
        await this.prisma.serviceFailure.deleteMany({
          where: { service: this.service, at: { lt: new Date(at - FAILURE_KEEP_MS) } },
        })
      }
    } catch (err) {
      this.logger.error(
        `Could not record a ${this.service} failure (${kind}: ${reason}): ${(err as Error).message}`
      )
    }
  }

  /** Failures at or after `since`: how many, and the newest `take`, newest first. */
  async since(since: Date, take: number): Promise<{ count: number; latest: FailureRow<K>[] }> {
    const where = { service: this.service, at: { gte: since } }
    const [count, rows] = await Promise.all([
      this.prisma.serviceFailure.count({ where }),
      this.prisma.serviceFailure.findMany({ where, orderBy: { at: 'desc' }, take }),
    ])
    return { count, latest: rows.map((r) => this.toRow(r)) }
  }

  /**
   * Failures per hour from `since`, for the System status page: `hours` counts, oldest first, where count i covers
   * [since + i hours, since + i + 1 hours). One grouped query. `at` is stored as UTC without a zone, so `since` is
   * converted to UTC in SQL and the answer does not depend on the session's time zone. A failure stamped after the last
   * hour (clock skew) counts in the last hour.
   */
  async perHour(since: Date, hours: number): Promise<number[]> {
    const from = since.toISOString()
    const rows = await this.prisma.$queryRaw<{ hour: number; count: number }[]>`
      SELECT floor(extract(epoch FROM ("at" - (${from}::timestamptz AT TIME ZONE 'UTC'))) / 3600)::int AS "hour",
             count(*)::int AS "count"
      FROM "ServiceFailure"
      WHERE "service" = ${this.service} AND "at" >= (${from}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY 1`
    const counts = new Array<number>(hours).fill(0)
    for (const r of rows) {
      const h = Math.min(Math.max(Number(r.hour), 0), hours - 1)
      counts[h] += Number(r.count)
    }
    return counts
  }

  /** The newest failure kept (up to FAILURE_KEEP_MS old); null when there is none. */
  async last(): Promise<FailureRow<K> | null> {
    const row = await this.prisma.serviceFailure.findFirst({
      where: { service: this.service },
      orderBy: { at: 'desc' },
    })
    return row ? this.toRow(row) : null
  }

  /** Failures in the last FAILURE_WINDOW_MS, for a public health check. */
  async recent(): Promise<RecentFailures> {
    const { count, latest } = await this.since(new Date(this.now() - FAILURE_WINDOW_MS), 1)
    const [last] = latest
    return {
      status: last ? 'failing' : 'ok',
      failures: count,
      windowMinutes: FAILURE_WINDOW_MS / 60_000,
      latest: last ? { at: last.at.toISOString(), reason: last.reason } : null,
    }
  }

  /** The last STATUS_WINDOW_HOURS hours of failures and the last one kept, for the System status page. */
  async history(): Promise<FailureHistory<K>> {
    const since = new Date(this.now() - STATUS_WINDOW_HOURS * 3_600_000)
    const [recent, perHour, last] = await Promise.all([
      this.since(since, STATUS_LIST),
      this.perHour(since, STATUS_WINDOW_HOURS),
      this.last(),
    ])
    return {
      failures: {
        windowHours: STATUS_WINDOW_HOURS,
        count: recent.count,
        perHour,
        latest: recent.latest.map((f) => ({
          at: f.at.toISOString(),
          reason: f.reason,
          kind: f.kind,
        })),
      },
      lastFailureAt: last ? last.at.toISOString() : null,
    }
  }

  private toRow(r: { at: Date; reason: string; kind: string }): FailureRow<K> {
    const kind = (this.kinds as readonly string[]).includes(r.kind) ? (r.kind as K) : this.kinds[0]
    return { at: r.at, reason: r.reason, kind }
  }
}
