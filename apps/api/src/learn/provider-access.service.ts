import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LEARN_ROLES, LearnService } from './learn.service'

/**
 * Staff roles that may read a provider's participant records (notes, support items, compensation,
 * resumes), as long as they also hold a membership in that provider's workspace. Agency admins and
 * case managers are deliberately not here; system admins pass every role check (LearnService.assertRole).
 */
export const PROVIDER_STAFF_ROLES: string[] = [LEARN_ROLES.providerAdmin]

/** Roles that may manage a cohort: the same as the roster (see LearnCohortsService). */
export const COHORT_STAFF_ROLES: string[] = [LEARN_ROLES.agencyAdmin, LEARN_ROLES.providerAdmin]

export interface CohortContext {
  cohortId: string
  /** The workspace that runs the cohort. */
  hostId: string
  hostSubdomain: string
  courseId: string
  /** The course's provider: the scope of notes, support items and talent profiles. */
  providerId: string
  delivery: 'online' | 'live' | 'hybrid'
}

/**
 * The access checks shared by talent, attendance and activity. Every feature calls these before it
 * touches data, so the rules live in one place. See docs/talent-and-attendance-design.md.
 */
@Injectable()
export class ProviderAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly learn: LearnService
  ) {}

  /** The provider (and host workspace) of a cohort. No permission check: use it to scope, not to authorize. */
  async providerOfCohort(cohortId: string): Promise<CohortContext> {
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      select: {
        id: true,
        delivery: true,
        courseId: true,
        institution: { select: { id: true, subdomain: true } },
        course: { select: { id: true, providerId: true } },
      },
    })
    if (!cohort || !cohort.course) throw new NotFoundException('Cohort not found')
    return {
      cohortId: cohort.id,
      hostId: cohort.institution.id,
      hostSubdomain: cohort.institution.subdomain as string,
      courseId: cohort.course.id,
      providerId: cohort.course.providerId,
      delivery: cohort.delivery as CohortContext['delivery'],
    }
  }

  /**
   * Throws unless the caller is staff of this provider: a system admin, or a provider admin with a
   * workspace-level membership (cohortId null) in the provider institution. Organization staff,
   * agency admins, other providers' staff and learners are refused.
   */
  async assertProviderStaff(
    userId: string,
    role: string | undefined,
    providerId: string
  ): Promise<void> {
    this.learn.assertRole(role, PROVIDER_STAFF_ROLES)
    if (role === LEARN_ROLES.systemAdmin) return
    const member = await this.prisma.membership.findFirst({
      where: {
        userId,
        institutionId: providerId,
        cohortId: null,
        institution: { kind: 'provider' },
      },
      select: { id: true },
    })
    if (!member) throw new ForbiddenException('No access to this provider')
  }

  /**
   * The roster guard: the caller may manage the cohort if they may open its workspace (agency admins
   * in scope, provider and organization admins who are members of it, system admins).
   * Same rule as LearnCohortsService.cohortFor.
   */
  async assertCohortStaff(
    userId: string,
    role: string | undefined,
    cohortId: string
  ): Promise<CohortContext> {
    this.learn.assertRole(role, COHORT_STAFF_ROLES)
    const ctx = await this.providerOfCohort(cohortId)
    await this.learn.assertWorkspace(userId, role, ctx.hostSubdomain)
    return ctx
  }

  /** Throws NotFound unless the person is (or was) enrolled in a cohort of one of this provider's courses. */
  async assertParticipantOfProvider(providerId: string, userId: string): Promise<void> {
    const found = await this.prisma.enrollment.findFirst({
      where: { userId, cohort: { course: { providerId } } },
      select: { id: true },
    })
    if (!found) throw new NotFoundException('Participant not found')
  }

  /** Throws unless the learner is (or was) enrolled with this provider: a learner may only touch their own record. */
  async assertLearnerOfProvider(userId: string, providerId: string): Promise<void> {
    const found = await this.prisma.enrollment.findFirst({
      where: { userId, cohort: { course: { providerId } } },
      select: { id: true },
    })
    if (!found) throw new ForbiddenException('You are not enrolled with this provider')
  }

  /** Throws unless the learner has an enrollment (any status) in the cohort. Returns the enrollment id. */
  async assertLearnerOfCohort(userId: string, cohortId: string): Promise<string> {
    const e = await this.prisma.enrollment.findUnique({
      where: { cohortId_userId: { cohortId, userId } },
      select: { id: true },
    })
    if (!e) throw new NotFoundException('Cohort not found')
    return e.id
  }
}
