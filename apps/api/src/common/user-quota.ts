import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * Per-user sliding-window quota for endpoints that cost real money (D-ID,
 * Whisper, Claude) or can be brute-forced (join keys). Runs after auth so it
 * keys on the verified userId, unlike the global IP throttler.
 *
 * In-memory, so limits are per API instance. If the API ever runs >1 replica,
 * back this with Redis (or the throttler's Redis storage).
 */
export class UserQuota {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly label = 'Too many requests'
  ) {}

  /** Throws 429 when `key` has used up its window. */
  assert(key: string, now = Date.now()): void {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs)
    if (recent.length >= this.max) {
      this.hits.set(key, recent)
      throw new HttpException(
        `${this.label} — please try again later`,
        HttpStatus.TOO_MANY_REQUESTS
      )
    }
    recent.push(now)
    this.hits.set(key, recent)
    if (this.hits.size > 5000) {
      for (const [k, ts] of this.hits)
        if (!ts.some((t) => now - t < this.windowMs)) this.hits.delete(k)
    }
  }
}
