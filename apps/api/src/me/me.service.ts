import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ClerkService } from '../auth/clerk.service'

/**
 * Endpoints scoped to the calling user.
 *
 * The User mirror table caches each Clerk user's email + displayName so
 * analytics / cohort views don't have to round-trip to Clerk for every
 * lookup. The frontend calls /me/sync once on sign-in to make sure the
 * row exists and is fresh.
 *
 * Self-join (Phase 6b) endpoints let a freshly-signed-up student look up
 * their institution by email domain and create a Membership for themselves
 * — either via that suggestion or by entering a cohort joinKey.
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

  /**
   * Returns the Institution whose emailDomain matches the caller's Clerk
   * email, or null if there's no match (or no email on record).
   *
   * We fetch the email straight from Clerk rather than relying on the User
   * mirror — the welcome page may run before /me/sync completes on first
   * login, and the mirror's email is allowed to be stale.
   */
  async getInstitutionSuggestion(userId: string) {
    const profile = await this.clerk.getUserProfile(userId)
    const domain = extractDomain(profile?.email)
    if (!domain) return { institution: null, email: profile?.email ?? null }
    const institution = await this.prisma.institution.findUnique({
      where: { emailDomain: domain },
      select: { id: true, name: true, emailDomain: true },
    })
    return { institution, email: profile?.email ?? null }
  }

  /**
   * Returns all memberships for the caller, with institution + cohort
   * details — used by the welcome page to short-circuit if the user
   * already joined, and by the dashboard CTA to know whether to show.
   */
  async listMemberships(userId: string) {
    const rows = await this.prisma.membership.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: {
        institution: { select: { id: true, name: true } },
        cohort: { select: { id: true, name: true } },
      },
    })
    return rows.map((m) => ({
      membershipId: m.id,
      institution: m.institution,
      cohort: m.cohort,
      joinedAt: m.createdAt,
    }))
  }

  /**
   * Creates a Membership for the caller. Two modes:
   *   - { joinKey } — find the cohort with that key, join its institution + cohort
   *   - { institutionId } — join the institution with no cohort (used when the
   *                        student matches by email domain but has no key)
   *
   * Always upserts the User mirror first so the FK is satisfied — the user
   * may not have hit /me/sync yet on a brand-new signup.
   */
  async join(userId: string, input: { joinKey?: string; institutionId?: string }) {
    await this.sync(userId)

    let institutionId: string
    let cohortId: string | null = null

    if (input.joinKey?.trim()) {
      const cohort = await this.prisma.cohort.findUnique({
        where: { joinKey: input.joinKey.trim() },
        select: { id: true, institutionId: true },
      })
      if (!cohort) {
        throw new NotFoundException(`No cohort found for join key "${input.joinKey.trim()}"`)
      }
      institutionId = cohort.institutionId
      cohortId = cohort.id
    } else if (input.institutionId) {
      const inst = await this.prisma.institution.findUnique({
        where: { id: input.institutionId },
        select: { id: true },
      })
      if (!inst) throw new NotFoundException(`Institution ${input.institutionId} not found`)
      institutionId = inst.id
    } else {
      throw new BadRequestException('Provide either joinKey or institutionId')
    }

    try {
      const membership = await this.prisma.membership.create({
        data: { userId, institutionId, cohortId },
      })
      return { membershipId: membership.id, institutionId, cohortId }
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('You are already a member of this cohort')
      }
      throw err
    }
  }

  /**
   * Lets the calling user remove their own Membership row. Verifies
   * ownership before deleting — a user can't delete someone else's
   * membership from this endpoint (admins use the cohort endpoint).
   */
  async leave(userId: string, membershipId: string): Promise<void> {
    const m = await this.prisma.membership.findUnique({ where: { id: membershipId } })
    if (!m || m.userId !== userId) {
      throw new NotFoundException(`Membership ${membershipId} not found`)
    }
    await this.prisma.membership.delete({ where: { id: membershipId } })
  }
}

function extractDomain(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.indexOf('@')
  if (at < 0 || at === email.length - 1) return null
  return email.slice(at + 1).trim().toLowerCase()
}
