/**
 * Tiny in-memory IP rate limiter for the public scenario-requests endpoint.
 *
 * Sliding window — keep timestamps for each IP for the window length, drop
 * older ones on each check. Single-instance only; if the API ever runs in
 * multiple replicas, swap for Redis (e.g. via @nestjs/throttler).
 */
export class IpRateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if this IP is allowed; false if it has exceeded the limit. */
  allow(ip: string): boolean {
    const now = Date.now()
    const cutoff = now - this.windowMs
    const recent = (this.hits.get(ip) ?? []).filter(t => t > cutoff)
    if (recent.length >= this.maxPerWindow) {
      this.hits.set(ip, recent)
      return false
    }
    recent.push(now)
    this.hits.set(ip, recent)
    return true
  }
}
