import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PRIVATE_MEDIA_STORAGE, type PrivateMediaStorage } from '../storage/media-storage.interface'

const DAY_MS = 86_400_000
const SWEEP_EVERY_MS = 6 * 60 * 60 * 1000
const BATCH = 200

/**
 * Deletes candidate recordings once they pass RECORDING_RETENTION_DAYS
 * (default 90; keep in step with the privacy policy). Transcripts, scores and
 * feedback are kept until the account is deleted — only the audio/video goes.
 * Idempotent, so running on several replicas is harmless.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name)
  private timer?: NodeJS.Timeout

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRIVATE_MEDIA_STORAGE) private readonly privateStorage: PrivateMediaStorage
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    setTimeout(() => void this.sweep(), 60_000).unref()
    this.timer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  retentionDays(): number {
    const n = Number(process.env.RECORDING_RETENTION_DAYS)
    return Number.isFinite(n) && n > 0 ? n : 90
  }

  /** Purge expired recordings. Returns how many were removed. */
  async sweep(now = Date.now()): Promise<number> {
    const cutoff = new Date(now - this.retentionDays() * DAY_MS)
    let removed = 0
    try {
      for (;;) {
        const rows = await this.prisma.immersiveResponse.findMany({
          where: { mediaUrl: { not: null }, createdAt: { lt: cutoff } },
          select: { id: true, mediaUrl: true },
          take: BATCH,
        })
        if (rows.length === 0) break
        for (const r of rows) {
          await this.privateStorage.delete(r.mediaUrl as string)
          await this.prisma.immersiveResponse.update({
            where: { id: r.id },
            data: { mediaUrl: null },
          })
          removed++
        }
      }
    } catch (err) {
      this.logger.error('Recording retention sweep failed', err instanceof Error ? err.stack : err)
    }
    if (removed) this.logger.log(`Retention: removed ${removed} expired recordings`)
    return removed
  }
}
