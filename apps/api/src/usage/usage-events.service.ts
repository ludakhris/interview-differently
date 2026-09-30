import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { normalizeRoute } from './usage-route'

const RETENTION_DAYS = 90
/** Per-user cap so a buggy or hostile client can't flood the table. */
const MAX_PER_MINUTE = 30

@Injectable()
export class UsageEventsService {
  /** userId → recent write timestamps. Per instance; good enough as a flood guard. */
  private recent = new Map<string, number[]>()

  constructor(private prisma: PrismaService) {}

  /** Record one page view. Silently drops (returns false) when rate-limited. */
  async recordPageView(userId: string, path: unknown): Promise<boolean> {
    const norm = normalizeRoute(path)
    if (!norm) throw new BadRequestException('path is required')
    if (!this.allow(userId)) return false

    await this.prisma.usageEvent.create({ data: { userId, route: norm.route, refId: norm.refId } })

    // Retention: opportunistic purge so no cron is needed.
    if (Math.random() < 0.02) {
      await this.prisma.usageEvent.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - RETENTION_DAYS * 86_400_000) } },
      })
    }
    return true
  }

  private allow(userId: string, now = Date.now()): boolean {
    const hits = (this.recent.get(userId) ?? []).filter((t) => now - t < 60_000)
    if (hits.length >= MAX_PER_MINUTE) {
      this.recent.set(userId, hits)
      return false
    }
    hits.push(now)
    this.recent.set(userId, hits)
    // Keep the map from growing without bound.
    if (this.recent.size > 5000) {
      for (const [id, ts] of this.recent)
        if (!ts.some((t) => now - t < 60_000)) this.recent.delete(id)
    }
    return true
  }
}
