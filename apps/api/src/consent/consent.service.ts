import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CONSENT_KINDS, CONSENT_VERSIONS, type ConsentKind } from './consent.versions'

@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  /** Current required versions plus which of them this user has accepted. */
  async status(userId: string) {
    const rows = await this.prisma.consentRecord.findMany({
      where: { userId },
      select: { kind: true, version: true, createdAt: true },
    })
    const accepted: Record<string, string | null> = {}
    for (const kind of CONSENT_KINDS) {
      accepted[kind] = rows.some((r) => r.kind === kind && r.version === CONSENT_VERSIONS[kind])
        ? CONSENT_VERSIONS[kind]
        : null
    }
    return { required: CONSENT_VERSIONS, accepted }
  }

  /** Records acceptance of the *current* version only — stale versions are rejected. */
  async accept(userId: string, kind: string, version: string) {
    if (!(CONSENT_KINDS as string[]).includes(kind)) {
      throw new BadRequestException(`Unknown consent kind "${kind}"`)
    }
    if (version !== CONSENT_VERSIONS[kind as ConsentKind]) {
      throw new BadRequestException('That version is out of date — reload and review the latest')
    }
    await this.prisma.consentRecord.upsert({
      where: { userId_kind_version: { userId, kind, version } },
      create: { userId, kind, version },
      update: {},
    })
    return this.status(userId)
  }

  /** True if the user has accepted the current version of `kind`. Used to gate server-side. */
  async hasAccepted(userId: string, kind: ConsentKind): Promise<boolean> {
    const row = await this.prisma.consentRecord.findUnique({
      where: { userId_kind_version: { userId, kind, version: CONSENT_VERSIONS[kind] } },
      select: { id: true },
    })
    return !!row
  }
}
