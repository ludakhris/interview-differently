import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Request shape after AdminGuard runs. `institutionIds` is only set for
 * institution-admins — the institutions they hold a Membership in (#25
 * Phase 5 / #15: the membership row *is* the admin binding).
 */
export interface AdminRequest {
  userId: string
  userRole?: string
  institutionIds?: string[]
}

/**
 * Institution scoping for admin endpoints that accept institution-admins.
 * Full admins pass every check; institution-admins are limited to the
 * institutions they belong to.
 */
@Injectable()
export class InstitutionScope {
  constructor(private prisma: PrismaService) {}

  isFullAdmin(req: AdminRequest): boolean {
    return req.userRole === 'admin'
  }

  /** Institution ids this admin may see, or null for "all". */
  visible(req: AdminRequest): string[] | null {
    return this.isFullAdmin(req) ? null : (req.institutionIds ?? [])
  }

  assertInstitution(req: AdminRequest, institutionId: string): void {
    if (this.isFullAdmin(req)) return
    if (!req.institutionIds?.includes(institutionId)) {
      throw new ForbiddenException('Not an admin of this institution')
    }
  }

  async assertCohort(req: AdminRequest, cohortId: string): Promise<void> {
    if (this.isFullAdmin(req)) return
    const cohort = await this.prisma.cohort.findUnique({ where: { id: cohortId }, select: { institutionId: true } })
    if (!cohort) throw new NotFoundException(`Cohort ${cohortId} not found`)
    this.assertInstitution(req, cohort.institutionId)
  }

  async assertDelivery(req: AdminRequest, deliveryId: string): Promise<void> {
    if (this.isFullAdmin(req)) return
    const delivery = await this.prisma.assessmentDelivery.findUnique({
      where: { id: deliveryId },
      select: { cohort: { select: { institutionId: true } } },
    })
    if (!delivery) throw new NotFoundException(`Delivery ${deliveryId} not found`)
    // Cohort deleted → the delivery belongs to no institution; full admins only.
    if (!delivery.cohort) throw new ForbiddenException('This delivery no longer belongs to a cohort')
    this.assertInstitution(req, delivery.cohort.institutionId)
  }

  /** Mutating a scenario (or its media): full admin, or owner institution. */
  async assertScenario(req: AdminRequest, scenarioId: string): Promise<void> {
    if (this.isFullAdmin(req)) return
    const row = await this.prisma.scenario.findUnique({ where: { scenarioId }, select: { institutionId: true } })
    if (!row) throw new NotFoundException(`Scenario ${scenarioId} not found`)
    this.assertOwns(req, row.institutionId)
  }

  // ── Owned content (datasets, assessments, scenarios) ─────────────────────
  // `institutionId` null = platform-wide: readable by every admin, editable
  // only by full admins. Set = owned by that institution.

  /** Prisma `where` fragment limiting rows to platform + own institutions. */
  contentWhere(req: AdminRequest): { OR: [{ institutionId: null }, { institutionId: { in: string[] } }] } | undefined {
    if (this.isFullAdmin(req)) return undefined
    return { OR: [{ institutionId: null }, { institutionId: { in: req.institutionIds ?? [] } }] }
  }

  assertReadable(req: AdminRequest, institutionId: string | null): void {
    if (institutionId === null) return
    this.assertInstitution(req, institutionId)
  }

  assertOwns(req: AdminRequest, institutionId: string | null): void {
    if (this.isFullAdmin(req)) return
    if (institutionId === null) throw new ForbiddenException('Platform content is read-only for institution admins')
    this.assertInstitution(req, institutionId)
  }

  /**
   * Owner to stamp on new content. Full admins default to platform-wide
   * (null) unless they pick an institution; institution-admins must own
   * it — auto-picked when they belong to exactly one institution.
   */
  ownerFor(req: AdminRequest, requested: string | null | undefined): string | null {
    if (this.isFullAdmin(req)) return requested ?? null
    const ids = req.institutionIds ?? []
    if (requested) {
      this.assertInstitution(req, requested)
      return requested
    }
    if (ids.length === 1) return ids[0]
    if (ids.length === 0) throw new ForbiddenException('You are not a member of any institution')
    throw new BadRequestException('institutionId is required — you admin more than one institution')
  }
}
