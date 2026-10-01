import { BadGatewayException, Inject, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PRIVATE_MEDIA_STORAGE, type PrivateMediaStorage } from '../storage/media-storage.interface'

const EXPORT_ROW_CAP = 5000
const EXPORT_URL_TTL_SECONDS = 15 * 60

/**
 * User data lifecycle: export (access/portability) and erasure. Erasure is
 * the single source of truth for "everything we hold about a user" — when a
 * new table gains a userId column, add it to `eraseUserData` and `exportUserData`.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRIVATE_MEDIA_STORAGE) private readonly privateStorage: PrivateMediaStorage
  ) {}

  /** Everything we hold about the user, as one JSON document. Recordings are 15-minute signed URLs. */
  async exportUserData(userId: string) {
    const take = EXPORT_ROW_CAP
    const [
      user,
      memberships,
      consents,
      results,
      attempts,
      sessions,
      assessmentAttempts,
      sqlQueries,
      pageViews,
    ] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.membership.findMany({
        where: { userId },
        include: { institution: { select: { name: true } }, cohort: { select: { name: true } } },
      }),
      this.prisma.consentRecord.findMany({ where: { userId } }),
      this.prisma.simulationResult.findMany({
        where: { userId },
        include: { dimensionScores: true },
        take,
      }),
      this.prisma.simulationAttempt.findMany({ where: { userId }, take }),
      this.prisma.immersiveSession.findMany({
        where: { userId },
        include: { responses: true },
        take,
      }),
      this.prisma.assessmentAttempt.findMany({ where: { userId }, take }),
      this.prisma.sqlQueryLog.findMany({ where: { userId }, take }),
      this.prisma.usageEvent.findMany({ where: { userId }, take }),
    ])

    const sessionsOut = await Promise.all(
      sessions.map(async (s) => ({
        ...s,
        responses: await Promise.all(
          s.responses.map(async ({ mediaUrl: key, ...r }) => ({
            ...r,
            recordingUrl: key
              ? await this.privateStorage
                  .getSignedUrl(key, EXPORT_URL_TTL_SECONDS)
                  .catch(() => null)
              : null,
          }))
        ),
      }))
    )

    return {
      exportedAt: new Date().toISOString(),
      note: `Recording links expire in ${EXPORT_URL_TTL_SECONDS / 60} minutes. Lists are capped at ${EXPORT_ROW_CAP} rows each.`,
      profile: user,
      memberships,
      consents,
      simulationResults: results,
      simulationAttempts: attempts,
      immersiveSessions: sessionsOut,
      assessmentAttempts,
      sqlQueries,
      pageViews,
    }
  }

  /**
   * Deletes every row and stored recording for the user. Recordings go first
   * and a storage failure aborts *before* any DB row is touched, so a retry
   * can still find the keys — never leave orphaned recordings behind.
   */
  async eraseUserData(userId: string): Promise<void> {
    const recordings = await this.prisma.immersiveResponse.findMany({
      where: { session: { userId }, mediaUrl: { not: null } },
      select: { mediaUrl: true },
    })
    try {
      for (const r of recordings) await this.privateStorage.delete(r.mediaUrl as string)
    } catch (err) {
      this.logger.error(
        `Recording deletion failed for ${userId}`,
        err instanceof Error ? err.stack : err
      )
      throw new BadGatewayException('Could not delete stored recordings — please try again')
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    })
    await this.prisma.$transaction([
      this.prisma.simulationResult.deleteMany({ where: { userId } }), // cascades DimensionScore
      this.prisma.simulationAttempt.deleteMany({ where: { userId } }),
      this.prisma.immersiveSession.deleteMany({ where: { userId } }), // cascades ImmersiveResponse
      this.prisma.assessmentAttempt.deleteMany({ where: { userId } }),
      this.prisma.sqlQueryLog.deleteMany({ where: { userId } }),
      this.prisma.usageEvent.deleteMany({ where: { userId } }),
      this.prisma.consentRecord.deleteMany({ where: { userId } }),
      // Scenario requests carry contact details but no userId — match on the account email.
      ...(user?.email
        ? [
            this.prisma.scenarioRequest.deleteMany({
              where: { contactEmail: { equals: user.email, mode: 'insensitive' } },
            }),
          ]
        : []),
      this.prisma.user.deleteMany({ where: { id: userId } }), // cascades Membership
    ])
    this.logger.log(`Erased data for user ${userId} (${recordings.length} recordings)`)
  }
}
