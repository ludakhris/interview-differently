import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import type {
  CohortDelivery,
  CohortDetail,
  CohortJoinRequestRow,
  CohortListItem,
  CohortRosterRow,
  CourseOffers,
  OfferTarget,
  RunnableCourse,
  ToolAttempt,
} from './learn-types'
import { PrismaService } from '../prisma/prisma.service'
import {
  assertApprovalContact,
  assertProfileRefresh,
  cohortStatus,
  endsAtFor,
  newJoinKey,
  validateCohortFields,
  validateEmail,
} from './cohort-config'
import { LearnerService } from './learner.service'
import { LEARN_ROLES, LearnService } from './learn.service'
import { ParticipantNotesService } from './talent/participant-notes.service'

const MANAGERS = [LEARN_ROLES.agencyAdmin, LEARN_ROLES.providerAdmin]

/** Cohorts of courses: created in the workspace that runs them (a provider, or an organization offered the course). */
@Injectable()
export class LearnCohortsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly learn: LearnService,
    private readonly learner: LearnerService,
    private readonly notes: ParticipantNotesService
  ) {}

  // ── access ────────────────────────────────────────────────────────────────

  private async workspaceFor(userId: string, role: string | undefined, subdomain: string) {
    this.learn.assertRole(role, MANAGERS)
    await this.learn.assertWorkspace(userId, role, subdomain)
    const ws = await this.prisma.institution.findFirst({
      where: { subdomain },
      select: { id: true, name: true, kind: true, subdomain: true },
    })
    if (!ws) throw new NotFoundException('Workspace not found')
    if (ws.kind === 'agency') throw new BadRequestException('Agencies do not run cohorts')
    return ws
  }

  private async cohortFor(userId: string, role: string | undefined, cohortId: string) {
    this.learn.assertRole(role, MANAGERS)
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      include: {
        institution: { select: { id: true, name: true, subdomain: true } },
        course: {
          select: {
            id: true,
            title: true,
            providerId: true,
            lengthWeeks: true,
            modules: { select: { _count: { select: { items: true } } } },
          },
        },
      },
    })
    if (!cohort || !cohort.course) throw new NotFoundException('Cohort not found')
    await this.learn.assertWorkspace(userId, role, cohort.institution.subdomain as string)
    return { ...cohort, course: cohort.course }
  }

  // ── courses a workspace can run ───────────────────────────────────────────

  async runnableCourses(
    userId: string,
    role: string | undefined,
    workspace: string
  ): Promise<RunnableCourse[]> {
    const ws = await this.workspaceFor(userId, role, workspace)
    const rows = await this.prisma.course.findMany({
      where: {
        status: 'published',
        OR: [{ providerId: ws.id }, { offers: { some: { institutionId: ws.id } } }],
      },
      select: { id: true, title: true, lengthWeeks: true, provider: { select: { name: true } } },
      orderBy: { title: 'asc' },
    })
    return rows.map((c) => ({
      id: c.id,
      title: c.title,
      provider: c.provider.name,
      lengthWeeks: c.lengthWeeks,
    }))
  }

  // ── cohorts ───────────────────────────────────────────────────────────────

  async list(
    userId: string,
    role: string | undefined,
    workspace: string
  ): Promise<CohortListItem[]> {
    const ws = await this.workspaceFor(userId, role, workspace)
    const rows = await this.prisma.cohort.findMany({
      where: { institutionId: ws.id, courseId: { not: null } },
      include: {
        course: { select: { id: true, title: true } },
        _count: {
          select: {
            enrollments: { where: { status: { not: 'withdrawn' } } },
            joinRequests: { where: { status: 'pending' } },
          },
        },
      },
      orderBy: { startsAt: 'desc' },
    })
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      courseId: c.course?.id as string,
      courseTitle: c.course?.title as string,
      startsAt: c.startsAt?.toISOString() ?? null,
      endsAt: c.endsAt?.toISOString() ?? null,
      status: cohortStatus(c.startsAt, c.endsAt),
      enrolled: c._count.enrollments,
      joinKey: c.joinKey,
      maxLearners: c.maxLearners,
      requiresApproval: c.requiresApproval,
      joinContact: c.joinContact,
      pendingRequests: c._count.joinRequests,
      delivery: c.delivery as CohortDelivery,
      requiresProfile: c.requiresProfile,
      profileRefreshMonths: c.profileRefreshMonths,
    }))
  }

  async create(
    userId: string,
    role: string | undefined,
    workspace: string,
    body: unknown
  ): Promise<CohortDetail> {
    const ws = await this.workspaceFor(userId, role, workspace)
    const fields = validateCohortFields(body, false)
    const runnable = await this.runnableCourses(userId, role, workspace)
    const course = runnable.find((c) => c.id === fields.courseId)
    if (!course)
      throw new BadRequestException(
        'That course is not available to this workspace, or is not published'
      )
    if (!course.lengthWeeks) {
      throw new BadRequestException(
        'Set the course length (weeks) first. A cohort lasts exactly that long.'
      )
    }
    // Codes are unique across both products and matched without regard to case.
    let joinKey = newJoinKey()
    while (
      await this.prisma.cohort.findFirst({
        where: { joinKey: { equals: joinKey, mode: 'insensitive' } },
        select: { id: true },
      })
    ) {
      joinKey = newJoinKey()
    }
    assertApprovalContact({ requiresApproval: false, joinContact: null }, fields)
    assertProfileRefresh({ requiresProfile: false, profileRefreshMonths: null }, fields)
    const startsAt = fields.startsAt as Date
    const cohort = await this.prisma.cohort.create({
      data: {
        institutionId: ws.id,
        courseId: course.id,
        name: fields.name as string,
        joinKey,
        startsAt,
        endsAt: endsAtFor(startsAt, course.lengthWeeks),
        maxLearners: fields.maxLearners ?? null,
        requiresApproval: fields.requiresApproval ?? false,
        joinContact: fields.joinContact ?? null,
        delivery: fields.delivery ?? 'online',
        requiresProfile: fields.requiresProfile ?? false,
        profileRefreshMonths: fields.profileRefreshMonths ?? null,
      },
    })
    return this.detail(userId, role, cohort.id)
  }

  async detail(userId: string, role: string | undefined, cohortId: string): Promise<CohortDetail> {
    const c = await this.cohortFor(userId, role, cohortId)
    const itemsTotal = c.course.modules.reduce((n, m) => n + m._count.items, 0)
    const pendingRequests = await this.prisma.joinRequest.count({
      where: { cohortId, status: 'pending' },
    })
    const enrollments = await this.prisma.enrollment.findMany({
      where: { cohortId },
      include: {
        user: { select: { displayName: true, email: true } },
        progress: { where: { status: 'completed' }, select: { id: true } },
      },
      orderBy: { enrolledAt: 'asc' },
    })
    const summaries = await this.notes.rosterNoteSummaries(
      userId,
      role,
      { providerId: c.course.providerId, hostId: c.institution.id },
      cohortId,
      enrollments.map((e) => e.userId)
    )
    const roster: CohortRosterRow[] = enrollments
      .map((e) => ({
        enrollmentId: e.id,
        userId: e.userId,
        name: e.user.displayName ?? e.user.email ?? e.userId,
        email: e.user.email,
        status: e.status as CohortRosterRow['status'],
        enrolledAt: e.enrolledAt.toISOString(),
        itemsDone: e.progress.length,
        itemsTotal,
        noteSummary: summaries?.get(e.userId) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return {
      id: c.id,
      name: c.name,
      courseId: c.course.id,
      courseTitle: c.course.title,
      startsAt: c.startsAt?.toISOString() ?? null,
      endsAt: c.endsAt?.toISOString() ?? null,
      status: cohortStatus(c.startsAt, c.endsAt),
      enrolled: roster.filter((r) => r.status !== 'withdrawn').length,
      joinKey: c.joinKey,
      maxLearners: c.maxLearners,
      requiresApproval: c.requiresApproval,
      joinContact: c.joinContact,
      pendingRequests,
      delivery: c.delivery as CohortDelivery,
      requiresProfile: c.requiresProfile,
      profileRefreshMonths: c.profileRefreshMonths,
      host: {
        id: c.institution.id,
        name: c.institution.name,
        subdomain: c.institution.subdomain as string,
      },
      lengthWeeks: c.course.lengthWeeks,
      roster,
    }
  }

  /** Rename, or move the start date (the end follows, since the length is fixed). */
  async update(
    userId: string,
    role: string | undefined,
    cohortId: string,
    body: unknown
  ): Promise<CohortDetail> {
    const c = await this.cohortFor(userId, role, cohortId)
    const fields = validateCohortFields(body, true)
    const data: {
      name?: string
      startsAt?: Date
      endsAt?: Date
      maxLearners?: number | null
      requiresApproval?: boolean
      joinContact?: string | null
      delivery?: CohortDelivery
      requiresProfile?: boolean
      profileRefreshMonths?: number | null
    } = {}
    if (fields.name) data.name = fields.name
    assertApprovalContact(c, fields)
    if (fields.requiresApproval !== undefined) data.requiresApproval = fields.requiresApproval
    if (fields.joinContact !== undefined) data.joinContact = fields.joinContact
    if (fields.delivery !== undefined) data.delivery = fields.delivery
    assertProfileRefresh(c, fields)
    if (fields.requiresProfile !== undefined) {
      data.requiresProfile = fields.requiresProfile
      // Turning the requirement off drops its refresh period unless one is set in the same request.
      if (!fields.requiresProfile && fields.profileRefreshMonths === undefined)
        data.profileRefreshMonths = null
    }
    if (fields.profileRefreshMonths !== undefined)
      data.profileRefreshMonths = fields.profileRefreshMonths
    if (fields.maxLearners !== undefined) {
      if (fields.maxLearners !== null) {
        const active = await this.activeCount(cohortId)
        if (fields.maxLearners < active) {
          throw new ConflictException(
            `${active} learners are already in this cohort, so the limit cannot go below ${active}.`
          )
        }
      }
      data.maxLearners = fields.maxLearners
    }
    if (fields.startsAt) {
      if (cohortStatus(c.startsAt, c.endsAt) !== 'upcoming') {
        throw new ConflictException('The start date can only change before the cohort starts.')
      }
      if (!c.course.lengthWeeks) throw new BadRequestException('The course has no length set')
      data.startsAt = fields.startsAt
      data.endsAt = endsAtFor(fields.startsAt, c.course.lengthWeeks)
    }
    await this.prisma.cohort.update({ where: { id: cohortId }, data })
    return this.detail(userId, role, cohortId)
  }

  /** Learners currently in a cohort: everyone not withdrawn. */
  private activeCount(cohortId: string): Promise<number> {
    return this.prisma.enrollment.count({ where: { cohortId, status: { not: 'withdrawn' } } })
  }

  private async isFull(cohortId: string, max: number | null): Promise<boolean> {
    return typeof max === 'number' && (await this.activeCount(cohortId)) >= max
  }

  // ── roster ────────────────────────────────────────────────────────────────

  /** Add someone who has already signed in to LearnDifferently. Everyone else joins with the code. */
  async addLearner(
    userId: string,
    role: string | undefined,
    cohortId: string,
    body: unknown
  ): Promise<CohortDetail> {
    const c = await this.cohortFor(userId, role, cohortId)
    const email = validateEmail((body as { email?: unknown } | null)?.email)
    const learner = await this.prisma.user.findUnique({
      where: { email_source: { email, source: 'learn' } },
    })
    if (!learner) {
      throw new NotFoundException(
        `No one with ${email} has signed in yet. Ask them to sign in, or share the join code ${c.joinKey ?? ''}.`.trim()
      )
    }
    const existing = await this.prisma.enrollment.findUnique({
      where: { cohortId_userId: { cohortId, userId: learner.id } },
    })
    if (existing && existing.status !== 'withdrawn')
      throw new ConflictException('That person is already in this cohort.')
    if (await this.isFull(cohortId, c.maxLearners))
      throw new ConflictException('This cohort is full.')
    if (existing) {
      await this.prisma.enrollment.update({
        where: { id: existing.id },
        data: { status: 'enrolled' },
      })
    } else {
      await this.prisma.enrollment.create({ data: { cohortId, userId: learner.id } })
    }
    await this.prisma.membership.upsert({
      where: {
        userId_institutionId_cohortId: {
          userId: learner.id,
          institutionId: c.institution.id,
          cohortId,
        },
      },
      create: { userId: learner.id, institutionId: c.institution.id, cohortId },
      update: {},
    })
    return this.detail(userId, role, cohortId)
  }

  // ── join requests (#68) ───────────────────────────────────────────────────

  /** People waiting for approval to join with the code. They are not on the roster. */
  async joinRequests(
    userId: string,
    role: string | undefined,
    cohortId: string
  ): Promise<CohortJoinRequestRow[]> {
    await this.cohortFor(userId, role, cohortId)
    const rows = await this.prisma.joinRequest.findMany({
      where: { cohortId, status: 'pending' },
      include: { user: { select: { displayName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.user.displayName ?? r.user.email ?? r.userId,
      email: r.user.email,
      requestedAt: r.createdAt.toISOString(),
    }))
  }

  /** The request and the right to decide it: same access as adding a learner to its cohort. */
  private async requestFor(userId: string, role: string | undefined, requestId: string) {
    const r = await this.prisma.joinRequest.findUnique({ where: { id: requestId } })
    if (!r) throw new NotFoundException('Join request not found')
    const cohort = await this.cohortFor(userId, role, r.cohortId)
    if (r.status !== 'pending') throw new ConflictException('That request was already decided.')
    return { request: r, cohort }
  }

  /** Enrolls the person exactly as joining with the code does, in one transaction with the decision. */
  async approveRequest(
    userId: string,
    role: string | undefined,
    requestId: string
  ): Promise<CohortDetail> {
    const { request, cohort } = await this.requestFor(userId, role, requestId)
    await this.prisma.$transaction(async (tx) => {
      // Serialize approvals of one cohort so two of them cannot both take the last seat.
      await tx.$queryRaw`SELECT "id" FROM "Cohort" WHERE "id" = ${cohort.id} FOR UPDATE`
      const claimed = await tx.joinRequest.updateMany({
        where: { id: request.id, status: 'pending' },
        data: { status: 'approved', decidedAt: new Date(), decidedBy: userId },
      })
      if (claimed.count === 0) throw new ConflictException('That request was already decided.')
      const existing = await tx.enrollment.findUnique({
        where: { cohortId_userId: { cohortId: cohort.id, userId: request.userId } },
      })
      if (!existing || existing.status === 'withdrawn') {
        if (typeof cohort.maxLearners === 'number') {
          const taken = await tx.enrollment.count({
            where: { cohortId: cohort.id, status: { not: 'withdrawn' } },
          })
          if (taken >= cohort.maxLearners) throw new ConflictException('This cohort is full.')
        }
        if (existing) {
          await tx.enrollment.update({ where: { id: existing.id }, data: { status: 'enrolled' } })
        } else {
          await tx.enrollment.create({ data: { cohortId: cohort.id, userId: request.userId } })
        }
      }
      await tx.membership.upsert({
        where: {
          userId_institutionId_cohortId: {
            userId: request.userId,
            institutionId: cohort.institution.id,
            cohortId: cohort.id,
          },
        },
        create: {
          userId: request.userId,
          institutionId: cohort.institution.id,
          cohortId: cohort.id,
        },
        update: {},
      })
    })
    return this.detail(userId, role, cohort.id)
  }

  /** Keeps the record, so the learner sees "not approved" and who to contact. */
  async declineRequest(
    userId: string,
    role: string | undefined,
    requestId: string
  ): Promise<CohortDetail> {
    const { request, cohort } = await this.requestFor(userId, role, requestId)
    const claimed = await this.prisma.joinRequest.updateMany({
      where: { id: request.id, status: 'pending' },
      data: { status: 'declined', decidedAt: new Date(), decidedBy: userId },
    })
    if (claimed.count === 0) throw new ConflictException('That request was already decided.')
    return this.detail(userId, role, cohort.id)
  }

  /** Withdraw rather than delete, so the learner's results stay for reporting. */
  async withdraw(
    userId: string,
    role: string | undefined,
    enrollmentId: string
  ): Promise<CohortDetail> {
    const e = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } })
    if (!e) throw new NotFoundException('Enrollment not found')
    await this.cohortFor(userId, role, e.cohortId)
    await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status: 'withdrawn' },
    })
    return this.detail(userId, role, e.cohortId)
  }

  /** Recomputes one learner's completion from the rules as they stand, and says what changed. */
  async recompute(
    userId: string,
    role: string | undefined,
    enrollmentId: string
  ): Promise<{ change: 'completed' | 'reopened' | 'date' | null; cohort: CohortDetail }> {
    const e = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } })
    if (!e) throw new NotFoundException('Enrollment not found')
    await this.cohortFor(userId, role, e.cohortId)
    const { change } = await this.learner.recomputeCompletion(enrollmentId)
    return { change, cohort: await this.detail(userId, role, e.cohortId) }
  }

  /** One learner's recorded scores for a connected-tool item (#67); same access as recompute. */
  async attempts(
    userId: string,
    role: string | undefined,
    enrollmentId: string,
    itemId: string | undefined
  ): Promise<{ attempts: ToolAttempt[]; attemptsBeforeLog: number }> {
    const e = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } })
    if (!e) throw new NotFoundException('Enrollment not found')
    const cohort = await this.cohortFor(userId, role, e.cohortId)
    if (!itemId) throw new BadRequestException('itemId is required')
    const item = await this.prisma.courseItem.findUnique({
      where: { id: itemId },
      include: { module: { select: { courseId: true } } },
    })
    if (!item || item.module.courseId !== cohort.course.id || item.type !== 'tool')
      throw new NotFoundException('Item not found')
    const progress = await this.prisma.itemProgress.findUnique({
      where: { enrollmentId_itemId: { enrollmentId, itemId } },
    })
    const { attemptLog, attemptsBeforeLog } = await this.learner.attemptLogOf(
      enrollmentId,
      item,
      progress?.attempts ?? 0,
      progress?.score ?? null
    )
    return { attempts: attemptLog, attemptsBeforeLog }
  }

  // ── offering a course to organizations ───────────────────────────────────

  async offers(userId: string, role: string | undefined, courseId: string): Promise<CourseOffers> {
    const course = await this.courseOwnedBy(userId, role, courseId)
    const [offered, candidates] = await Promise.all([
      this.prisma.courseOffer.findMany({
        where: { courseId },
        include: { institution: { select: { id: true, name: true, subdomain: true } } },
      }),
      this.prisma.institution.findMany({
        where: {
          kind: { in: ['organization', 'academic'] },
          subdomain: { not: null },
          ...(course.provider.parentId ? { parentId: course.provider.parentId } : { id: 'none' }),
        },
        select: { id: true, name: true, subdomain: true },
        orderBy: { name: 'asc' },
      }),
    ])
    const have = new Set(offered.map((o) => o.institutionId))
    const target = (i: { id: string; name: string; subdomain: string | null }): OfferTarget => ({
      id: i.id,
      name: i.name,
      subdomain: i.subdomain as string,
    })
    return {
      offered: offered.map((o) => target(o.institution)),
      available: candidates.filter((i) => !have.has(i.id)).map(target),
    }
  }

  async offer(
    userId: string,
    role: string | undefined,
    courseId: string,
    body: unknown
  ): Promise<CourseOffers> {
    const course = await this.courseOwnedBy(userId, role, courseId)
    const subdomain = (body as { workspace?: unknown } | null)?.workspace
    if (typeof subdomain !== 'string') throw new BadRequestException('Choose an organization')
    const org = await this.prisma.institution.findFirst({
      where: {
        subdomain,
        kind: { in: ['organization', 'academic'] },
        ...(course.provider.parentId ? { parentId: course.provider.parentId } : { id: 'none' }),
      },
    })
    if (!org) throw new NotFoundException('That organization cannot be offered this course')
    await this.prisma.courseOffer.upsert({
      where: { courseId_institutionId: { courseId, institutionId: org.id } },
      create: { courseId, institutionId: org.id },
      update: {},
    })
    return this.offers(userId, role, courseId)
  }

  async unoffer(
    userId: string,
    role: string | undefined,
    courseId: string,
    subdomain: string
  ): Promise<CourseOffers> {
    await this.courseOwnedBy(userId, role, courseId)
    const org = await this.prisma.institution.findFirst({ where: { subdomain } })
    if (!org) throw new NotFoundException('Organization not found')
    const running = await this.prisma.cohort.count({ where: { courseId, institutionId: org.id } })
    if (running > 0)
      throw new ConflictException('That organization already has cohorts of this course.')
    await this.prisma.courseOffer.deleteMany({ where: { courseId, institutionId: org.id } })
    return this.offers(userId, role, courseId)
  }

  private async courseOwnedBy(userId: string, role: string | undefined, courseId: string) {
    this.learn.assertRole(role, MANAGERS)
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { provider: { select: { id: true, subdomain: true, parentId: true } } },
    })
    if (!course) throw new NotFoundException('Course not found')
    await this.learn.assertWorkspace(userId, role, course.provider.subdomain as string)
    return course
  }
}
