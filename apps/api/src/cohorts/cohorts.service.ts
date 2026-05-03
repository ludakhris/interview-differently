import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ClerkService } from '../auth/clerk.service'

export interface CohortInput {
  name: string
  joinKey?: string | null
}

export interface AddMemberInput {
  /** Add by Clerk userId (preferred — exact match) */
  userId?: string
  /** Or by email — must already exist in the User mirror table */
  email?: string
}

@Injectable()
export class CohortsService {
  constructor(
    private prisma: PrismaService,
    private clerk: ClerkService,
  ) {}

  async listForInstitution(institutionId: string) {
    await this.assertInstitutionExists(institutionId)
    const rows = await this.prisma.cohort.findMany({
      where: { institutionId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { memberships: true } } },
    })
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      joinKey: c.joinKey,
      createdAt: c.createdAt,
      memberCount: c._count.memberships,
    }))
  }

  async create(institutionId: string, input: CohortInput) {
    if (!input.name?.trim()) throw new BadRequestException('name is required')
    await this.assertInstitutionExists(institutionId)
    const joinKey = input.joinKey?.trim() || null
    try {
      return await this.prisma.cohort.create({
        data: { institutionId, name: input.name.trim(), joinKey },
      })
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException(`Join key "${joinKey}" is already in use`)
      }
      throw err
    }
  }

  async update(cohortId: string, input: Partial<CohortInput>) {
    const data: { name?: string; joinKey?: string | null } = {}
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new BadRequestException('name cannot be empty')
      data.name = input.name.trim()
    }
    if (input.joinKey !== undefined) {
      data.joinKey = input.joinKey?.trim() || null
    }
    try {
      return await this.prisma.cohort.update({ where: { id: cohortId }, data })
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2025') throw new NotFoundException(`Cohort ${cohortId} not found`)
      if (code === 'P2002') throw new ConflictException(`Join key "${data.joinKey}" is already in use`)
      throw err
    }
  }

  async remove(cohortId: string): Promise<void> {
    try {
      await this.prisma.cohort.delete({ where: { id: cohortId } })
    } catch (err) {
      if ((err as { code?: string }).code === 'P2025') {
        throw new NotFoundException(`Cohort ${cohortId} not found`)
      }
      throw err
    }
  }

  async listMembers(cohortId: string) {
    const cohort = await this.prisma.cohort.findUnique({ where: { id: cohortId } })
    if (!cohort) throw new NotFoundException(`Cohort ${cohortId} not found`)

    const rows = await this.prisma.membership.findMany({
      where: { cohortId },
      orderBy: { createdAt: 'asc' },
      include: { user: true },
    })
    return rows.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      email: m.user?.email ?? null,
      displayName: m.user?.displayName ?? null,
      joinedAt: m.createdAt,
    }))
  }

  /**
   * Add a member to a cohort. Lookup priority:
   *   1. userId (exact Clerk id) — caller knows the user
   *   2. email — must already exist in the User mirror table
   *
   * If the user has no User row yet, we attempt to backfill from Clerk
   * (when userId is supplied). For email-only lookups we require the user
   * to have signed in once — telling the admin "user not found, ask them
   * to sign in first" is clearer than silently failing later.
   */
  async addMember(cohortId: string, input: AddMemberInput) {
    const cohort = await this.prisma.cohort.findUnique({ where: { id: cohortId } })
    if (!cohort) throw new NotFoundException(`Cohort ${cohortId} not found`)

    let userId: string | null = null
    if (input.userId) {
      userId = input.userId
      // Backfill the User mirror from Clerk if missing.
      await this.upsertUserFromClerk(userId)
    } else if (input.email) {
      const trimmed = input.email.trim().toLowerCase()
      const user = await this.prisma.user.findUnique({ where: { email: trimmed } })
      if (!user) {
        throw new NotFoundException(
          `No user with email "${trimmed}" has signed in yet. Ask them to sign in once, then re-add them.`,
        )
      }
      userId = user.id
    } else {
      throw new BadRequestException('Provide either userId or email')
    }

    try {
      const membership = await this.prisma.membership.create({
        data: { userId, institutionId: cohort.institutionId, cohortId },
      })
      return { membershipId: membership.id, userId }
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('User is already in this cohort')
      }
      throw err
    }
  }

  async removeMember(cohortId: string, membershipId: string): Promise<void> {
    const m = await this.prisma.membership.findUnique({ where: { id: membershipId } })
    if (!m || m.cohortId !== cohortId) {
      throw new NotFoundException(`Membership ${membershipId} not found in cohort ${cohortId}`)
    }
    await this.prisma.membership.delete({ where: { id: membershipId } })
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async assertInstitutionExists(institutionId: string): Promise<void> {
    const exists = await this.prisma.institution.findUnique({ where: { id: institutionId } })
    if (!exists) throw new NotFoundException(`Institution ${institutionId} not found`)
  }

  /**
   * Ensures a User row exists for the Clerk id. If missing, fetches the
   * profile from Clerk and inserts. Failures here aren't fatal — the
   * Membership can be created with just the userId; we just won't have
   * the email/name cached for analytics.
   */
  private async upsertUserFromClerk(userId: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } })
    if (existing) return
    const profile = await this.clerk.getUserProfile(userId)
    await this.prisma.user.create({
      data: {
        id: userId,
        email: profile?.email ?? null,
        displayName: profile?.displayName ?? null,
      },
    })
  }
}
