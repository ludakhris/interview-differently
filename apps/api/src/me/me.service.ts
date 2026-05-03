import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ClerkService } from '../auth/clerk.service'

/**
 * Endpoints scoped to the calling user. Today: just User-mirror sync.
 *
 * The User mirror table caches each Clerk user's email + displayName so
 * analytics / cohort views don't have to round-trip to Clerk for every
 * lookup. The frontend calls /me/sync once on sign-in to make sure the
 * row exists and is fresh.
 */
@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name)

  constructor(
    private prisma: PrismaService,
    private clerk: ClerkService,
  ) {}

  /**
   * Upserts the calling user's row in the User mirror with the latest
   * email + display name from Clerk. Idempotent — safe to call on every
   * sign-in.
   */
  async sync(userId: string) {
    const profile = await this.clerk.getUserProfile(userId)
    const data = {
      email: profile?.email ?? null,
      displayName: profile?.displayName ?? null,
    }
    const row = await this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, ...data },
      update: data,
    })
    return { id: row.id, email: row.email, displayName: row.displayName }
  }
}
