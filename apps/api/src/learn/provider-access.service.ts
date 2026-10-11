import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AccessService } from './access/access.service'

/**
 * The cohorts whose people an institution may see: a provider's are those of its own courses; an
 * organization's are the cohorts it hosts. (A provider that hosts a cohort of someone else's course
 * does not gain its people; only organizations match on hosting.)
 */
export function institutionCohortWhere(institutionId: string) {
  return {
    OR: [
      { course: { providerId: institutionId } },
      { institutionId, institution: { kind: 'organization' } },
    ],
  }
}

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
    private readonly access: AccessService
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
   * Throws unless the caller is staff of this provider or organization (action `participant.records`):
   * a system admin, or a provider or organization admin with a role at that institution. Agency
   * admins, case managers, other institutions' staff and learners are refused.
   */
  async assertProviderStaff(
    userId: string,
    role: string | undefined,
    providerId: string
  ): Promise<void> {
    await this.access.authorize({ userId, role }, 'participant.records', {
      institutionId: providerId,
    })
  }

  /** Throws unless the caller holds a role that reads participant records at some institution (or is a system admin). */
  async assertStaffAnywhere(userId: string, role: string | undefined): Promise<void> {
    await this.access.authorizeAnywhere({ userId, role }, 'participant.records')
  }

  /**
   * Which institution's records the caller works with on a cohort: the course's provider if they are
   * its staff, else the hosting organization if they are its staff, else null (restricted).
   */
  async scopeForCohort(
    userId: string,
    role: string | undefined,
    ctx: Pick<CohortContext, 'providerId' | 'hostId'>
  ): Promise<string | null> {
    for (const id of [ctx.providerId, ctx.hostId]) {
      try {
        await this.assertProviderStaff(userId, role, id)
        return id
      } catch (err) {
        if (!(err instanceof ForbiddenException)) throw err
      }
    }
    return null
  }

  /**
   * The roster guard (action `cohort.staff`): the caller may work the cohort if they may open its
   * workspace as a manager, or teach the cohort. Same rule as LearnCohortsService.
   */
  async assertCohortStaff(
    userId: string,
    role: string | undefined,
    cohortId: string
  ): Promise<CohortContext> {
    await this.access.authorize({ userId, role }, 'cohort.staff', { cohortId })
    return this.providerOfCohort(cohortId)
  }

  /** Throws NotFound unless the person is (or was) enrolled in a cohort in this institution's scope. */
  async assertParticipantOfProvider(providerId: string, userId: string): Promise<void> {
    const found = await this.prisma.enrollment.findFirst({
      where: { userId, cohort: institutionCohortWhere(providerId) },
      select: { id: true },
    })
    if (!found) throw new NotFoundException('Participant not found')
  }

  /** Throws unless the learner is (or was) enrolled with this provider: a learner may only touch their own record. */
  async assertLearnerOfProvider(userId: string, providerId: string): Promise<void> {
    const found = await this.prisma.enrollment.findFirst({
      where: { userId, cohort: institutionCohortWhere(providerId) },
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
