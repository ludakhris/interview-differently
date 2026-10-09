import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import type {
  AssessmentImprovement,
  AssessmentResults,
  AssessmentSummary,
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
import { SIMULATOR_FEED, type SimulatorFeed } from '../core/simulator-feed'
import type {
  AssessmentDeliveryResults,
  AssessmentMonitorDelivery,
  CohortAssessmentMonitor,
  CohortSqlMonitor,
} from '../core/monitor-types'
import { assessmentLimits, toolAnyById } from '../lti/platform/lti-platform-config'
import {
  assertApprovalContact,
  assertProfileRefresh,
  cohortStatus,
  endsAtFor,
  newJoinKey,
  validateCohortFields,
  validateEmail,
} from './cohort-config'
import { CSV_BOM, csvLine } from './attendance/attendance-rules'
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
    private readonly notes: ParticipantNotesService,
    @Inject(SIMULATOR_FEED) private readonly feed: SimulatorFeed
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

  /** The assessment items of a course, in course order. */
  private async assessmentItems(courseId: string) {
    const tools = await this.prisma.courseItem.findMany({
      where: { module: { courseId }, type: 'tool' },
      orderBy: [{ module: { position: 'asc' } }, { position: 'asc' }],
      select: { id: true, title: true, label: true, config: true },
    })
    return tools.filter(
      (t) => toolAnyById((t.config as { toolId?: unknown } | null)?.toolId)?.kind === 'assessment'
    )
  }

  /**
   * The cohort's Assessments grid: for each assessment item of the course, how many have not
   * started, have it open or have submitted, the average score, and (on the post-assessment) the
   * improvement over the pre-assessment. Built only from what the course records: scores that came
   * back and the time the tool was opened. How far through the questions a learner is, and their
   * section scores, stay with the Simulator (see assessmentResults and the live monitor).
   */
  async assessmentSummary(
    userId: string,
    role: string | undefined,
    cohortId: string
  ): Promise<AssessmentSummary> {
    const cohort = await this.cohortFor(userId, role, cohortId)
    const items = await this.assessmentItems(cohort.course.id)
    const generatedAt = new Date().toISOString()
    if (items.length === 0) return { generatedAt, items: [] }
    const enrollments = await this.prisma.enrollment.findMany({
      where: { cohortId, status: { not: 'withdrawn' } },
      select: { id: true },
    })
    const where = {
      itemId: { in: items.map((i) => i.id) },
      enrollmentId: { in: enrollments.map((e) => e.id) },
    }
    const [progress, attempts, launches] = await Promise.all([
      this.prisma.itemProgress.findMany({
        where,
        select: { enrollmentId: true, itemId: true, score: true, attempts: true },
      }),
      this.prisma.itemAttempt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: { enrollmentId: true, itemId: true, createdAt: true },
      }),
      this.prisma.activitySession.findMany({
        where: { ...where, kind: 'tool' },
        orderBy: { startedAt: 'desc' },
        select: { enrollmentId: true, itemId: true, startedAt: true },
      }),
    ])
    const key = (e: string, i: string | null) => `${e}:${i}`
    const progressBy = new Map(progress.map((p) => [key(p.enrollmentId, p.itemId), p]))
    // newest first, so the first row seen for a pair is its latest
    const lastAttempt = new Map<string, Date>()
    for (const a of attempts) {
      const k = key(a.enrollmentId, a.itemId)
      if (!lastAttempt.has(k)) lastAttempt.set(k, a.createdAt)
    }
    const lastOpened = new Map<string, Date>()
    for (const l of launches) {
      const k = key(l.enrollmentId, l.itemId)
      if (!lastOpened.has(k)) lastOpened.set(k, l.startedAt)
    }
    const preItem = items.find((i) => i.label === 'pre')
    return {
      generatedAt,
      items: items.map((item) => {
        const allowed = assessmentLimits(item.config).maxAttempts
        const counts = { notStarted: 0, inProgress: 0, submitted: 0 }
        const scores: number[] = []
        for (const e of enrollments) {
          const k = key(e.id, item.id)
          const p = progressBy.get(k)
          const status = assessmentStatusOf({
            attempts: p?.attempts ?? 0,
            allowed,
            lastAttemptAt: lastAttempt.get(k) ?? null,
            openedAt: lastOpened.get(k) ?? null,
          })
          if (status === 'not_started') counts.notStarted++
          else if (status === 'in_progress') counts.inProgress++
          else counts.submitted++
          if (typeof p?.score === 'number') scores.push(p.score)
        }
        const improvement =
          item.label === 'post' && preItem
            ? improvementOf(
                enrollments.map((e) => ({
                  pre: progressBy.get(key(e.id, preItem.id))?.score ?? null,
                  post: progressBy.get(key(e.id, item.id))?.score ?? null,
                }))
              )
            : null
        return {
          itemId: item.id,
          title: item.title,
          label: item.label === 'pre' || item.label === 'post' ? item.label : null,
          attemptsAllowed: allowed,
          counts,
          averageScore: scores.length
            ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
            : null,
          improvement,
        }
      }),
    }
  }

  /**
   * Every learner's result on one assessment of the cohort: status, time taken, overall and
   * section scores (from the Simulator) and, on the post-assessment, each learner's change from
   * the pre-assessment (from the course's own scores).
   */
  async assessmentResults(
    userId: string,
    role: string | undefined,
    cohortId: string,
    itemId: string
  ): Promise<AssessmentResults> {
    const cohort = await this.cohortFor(userId, role, cohortId)
    const items = await this.assessmentItems(cohort.course.id)
    const item = items.find((i) => i.id === itemId)
    if (!item) throw new NotFoundException('Assessment not found')
    return this.resultsFor(cohort, items, item)
  }

  private async resultsFor(
    cohort: { id: string; institution: { id: string } },
    items: { id: string; title: string; label: string | null }[],
    item: { id: string; title: string; label: string | null }
  ): Promise<AssessmentResults> {
    const roster = await this.prisma.enrollment.findMany({
      where: { cohortId: cohort.id, status: { not: 'withdrawn' } },
      select: { id: true, userId: true, user: { select: { email: true, displayName: true } } },
    })
    // Retakes are separate deliveries; the latest attempt a learner has is the one shown.
    const monitor = await this.feed.assessmentMonitor(cohort.institution.id, cohort.id)
    const runs = monitor.deliveries
      .map((d) => ({ d, launched: launchedItem(d.label) }))
      .filter((x) => x.launched?.itemId === item.id)
      .sort((a, b) => (a.launched?.attempt ?? 0) - (b.launched?.attempt ?? 0))
    const results = await Promise.all(
      runs.map((r) => this.feed.assessmentResults(cohort.id, r.d.id))
    )
    const attemptOf = new Map<string, AssessmentDeliveryResults['attempts'][number]>()
    for (const r of results) for (const a of r.attempts) attemptOf.set(a.userId, a)
    const last = results[results.length - 1]
    const isPost = item.label === 'post'
    const preItem = items.find((i) => i.label === 'pre')
    const scores =
      isPost && preItem
        ? await this.prisma.itemProgress.findMany({
            where: {
              itemId: { in: [preItem.id, item.id] },
              enrollmentId: { in: roster.map((e) => e.id) },
            },
            select: { enrollmentId: true, itemId: true, score: true },
          })
        : []
    const score = (enrollmentId: string, itemId: string) =>
      scores.find((x) => x.enrollmentId === enrollmentId && x.itemId === itemId)?.score ?? null
    const learners = roster
      .map((e) => {
        const a = attemptOf.get(e.userId)
        const pre = isPost && preItem ? score(e.id, preItem.id) : null
        const post = isPost ? score(e.id, item.id) : null
        return {
          enrollmentId: e.id,
          userId: e.userId,
          name: e.user.displayName ?? e.user.email ?? e.userId,
          email: e.user.email,
          status: a ? a.status : ('not_started' as const),
          submittedAt: a?.submittedAt ?? null,
          late: a?.late ?? false,
          minutes: a?.minutes ?? null,
          overall: a?.overall ? a.overall.percent : null,
          sections: (a?.sections ?? []).map(({ sectionId, correct, total }) => ({
            sectionId,
            correct,
            total,
          })),
          pre,
          post,
          change: pre !== null && post !== null ? post - pre : null,
        }
      })
      // Learners with a result first, then those working on it, then those who have not started.
      .sort(
        (a, b) =>
          RESULT_RANK[a.status] - RESULT_RANK[b.status] ||
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      )
    return {
      itemId: item.id,
      title: item.title,
      label: item.label === 'pre' || item.label === 'post' ? item.label : null,
      sections: last?.sections ?? [],
      expectedMinutes: last?.expectedMinutes ?? null,
      medianMinutes: last?.medianMinutes ?? null,
      improvement: isPost
        ? improvementOf(learners.map((l) => ({ pre: l.pre, post: l.post })))
        : null,
      learners,
    }
  }

  /** One assessment's results as a CSV (one row per learner, a column per section). */
  async assessmentResultsCsv(
    userId: string,
    role: string | undefined,
    cohortId: string,
    itemId: string
  ): Promise<string> {
    const r = await this.assessmentResults(userId, role, cohortId, itemId)
    const post = r.label === 'post'
    const lines = [
      csvLine([
        'learner',
        'email',
        'status',
        'submitted_at',
        'late',
        'minutes',
        'overall_percent',
        ...r.sections.map((s) => `${s.title} (correct/total)`),
        ...(post ? ['pre_percent', 'post_percent', 'change_points'] : []),
      ]),
      ...r.learners.map((l) =>
        csvLine([
          l.name,
          l.email,
          l.status,
          l.submittedAt,
          l.late ? 'yes' : '',
          l.minutes,
          l.overall,
          ...r.sections.map((s) => {
            const x = l.sections.find((y) => y.sectionId === s.id)
            return x ? `${x.correct}/${x.total}` : ''
          }),
          ...(post ? [l.pre, l.post, l.change] : []),
        ])
      ),
    ]
    return CSV_BOM + lines.join('\r\n') + '\r\n'
  }

  /** Every assessment of the cohort in one CSV: a row per learner per assessment. */
  async assessmentsCsv(
    userId: string,
    role: string | undefined,
    cohortId: string
  ): Promise<string> {
    const cohort = await this.cohortFor(userId, role, cohortId)
    const items = await this.assessmentItems(cohort.course.id)
    const all = await Promise.all(items.map((i) => this.resultsFor(cohort, items, i)))
    const lines = [
      csvLine([
        'assessment',
        'learner',
        'email',
        'status',
        'submitted_at',
        'late',
        'minutes',
        'overall_percent',
        'pre_percent',
        'post_percent',
        'change_points',
      ]),
      ...all.flatMap((r) =>
        r.learners.map((l) =>
          csvLine([
            r.title,
            l.name,
            l.email,
            l.status,
            l.submittedAt,
            l.late ? 'yes' : '',
            l.minutes,
            l.overall,
            l.pre,
            l.post,
            l.change,
          ])
        )
      ),
    ]
    return CSV_BOM + lines.join('\r\n') + '\r\n'
  }

  /**
   * How far through each assessment this cohort's learners are, live from the Simulator. Same
   * staff access as the rest of the cohort; a course launch is named by its course item.
   */
  async assessmentMonitor(
    userId: string,
    role: string | undefined,
    cohortId: string
  ): Promise<CohortAssessmentMonitor> {
    const cohort = await this.cohortFor(userId, role, cohortId)
    const monitor = await this.feed.assessmentMonitor(cohort.institution.id, cohortId)
    // The course decides what is listed: one card per assessment item, in course order, even
    // before anyone has started it. What the Simulator knows is matched to the item by its launch.
    const items = await this.assessmentItems(cohort.course.id)
    const itemIds = new Set(items.map((i) => i.id))
    const launches = new Map<string, { attempt: number; d: AssessmentMonitorDelivery }[]>()
    const other: AssessmentMonitorDelivery[] = []
    for (const d of monitor.deliveries) {
      const launched = launchedItem(d.label)
      if (launched && itemIds.has(launched.itemId))
        launches.set(launched.itemId, [
          ...(launches.get(launched.itemId) ?? []),
          { attempt: launched.attempt, d },
        ])
      else other.push(d)
    }
    // The course roster decides who is listed on a course card (the Simulator also knows people the
    // course does not), and is everyone's state for an assessment nobody has launched yet.
    const roster = items.length
      ? await this.prisma.enrollment.findMany({
          where: { cohortId, status: { not: 'withdrawn' } },
          select: { userId: true, user: { select: { email: true, displayName: true } } },
        })
      : []
    const enrolled = new Set(roster.map((e) => e.userId))
    const onRoster = (d: AssessmentMonitorDelivery): AssessmentMonitorDelivery => {
      const students = d.students.filter((x) => enrolled.has(x.userId))
      const count = (st: string) => students.filter((x) => x.status === st).length
      return {
        ...d,
        students,
        counts: {
          notStarted: count('not_started'),
          inProgress: count('in_progress'),
          submitted: count('submitted'),
        },
      }
    }
    const notStarted = (item: (typeof items)[number]): AssessmentMonitorDelivery => ({
      id: `item-${item.id}`,
      label: item.title,
      tags: item.label ? [item.label] : [],
      assessmentTitle: null,
      itemId: item.id,
      opensAt: null,
      closesAt: null,
      timeLimitMinutes: assessmentLimits(item.config).timeLimitMinutes,
      counts: { notStarted: roster.length, inProgress: 0, submitted: 0 },
      students: roster
        .map((e) => ({
          userId: e.userId,
          name: e.user.displayName ?? e.user.email ?? e.userId,
          email: e.user.email,
          status: 'not_started' as const,
          answeredCount: 0,
          questionCount: 0,
          startedAt: null,
          submittedAt: null,
          lastActivityAt: null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    })
    return {
      generatedAt: monitor.generatedAt,
      cohort: monitor.cohort,
      deliveries: items.flatMap((item) => {
        const runs = (launches.get(item.id) ?? []).sort((a, b) => a.attempt - b.attempt)
        if (runs.length === 0) return [notStarted(item)]
        return runs.map(({ attempt, d }) => ({
          ...onRoster(d),
          itemId: item.id,
          label: item.title,
          tags: [
            ...(item.label ? [item.label] : []),
            ...(runs.length > 1 ? [`attempt ${attempt}`] : []),
          ],
        }))
      }),
      other: other.map((d) => ({
        ...d,
        label: d.assessmentTitle ?? d.label,
        tags: d.label ? [d.label] : [],
      })),
    }
  }

  /** The SQL each learner of this cohort has run, live from the Simulator. Same staff access. */
  async sqlMonitor(
    userId: string,
    role: string | undefined,
    cohortId: string
  ): Promise<CohortSqlMonitor> {
    await this.cohortFor(userId, role, cohortId)
    return this.feed.sqlMonitor(cohortId)
  }

  /**
   * Staff may open a learner's answers on an assessment item of this cohort. Returns who and what
   * to launch; the caller starts the LTI review launch.
   */
  async reviewTarget(
    userId: string,
    role: string | undefined,
    enrollmentId: string,
    itemId: string | undefined
  ): Promise<{ cohortId: string; itemId: string; learnerUserId: string }> {
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
    return { cohortId: e.cohortId, itemId, learnerUserId: e.userId }
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

/**
 * A learner's place on an assessment, from the course's own records. Open means the tool was
 * opened after the last score came back (or there is no score yet), with attempts left to use.
 */
export function assessmentStatusOf(a: {
  attempts: number
  allowed: number
  lastAttemptAt: Date | null
  openedAt: Date | null
}): 'not_started' | 'in_progress' | 'submitted' {
  const reopened = a.openedAt !== null && (a.lastAttemptAt === null || a.openedAt > a.lastAttemptAt)
  if (a.attempts < a.allowed && reopened) return 'in_progress'
  return a.attempts > 0 ? 'submitted' : 'not_started'
}

const RESULT_RANK = { submitted: 0, in_progress: 1, not_started: 2 } as const

/** The course item and attempt number behind a course-launched delivery's label (`lti:<itemId>` or `lti:<itemId>#<n>`). */
export function launchedItem(label: string): { itemId: string; attempt: number } | null {
  const m = /^lti:(.+?)(?:#(\d+))?$/.exec(label)
  return m ? { itemId: m[1], attempt: m[2] ? Number(m[2]) : 1 } : null
}

/**
 * How a cohort did on the post-assessment compared with the pre-assessment, over the learners who
 * have both scores; null when none do.
 */
export function improvementOf(
  pairs: { pre: number | null; post: number | null }[]
): AssessmentImprovement | null {
  const both = pairs.filter(
    (p): p is { pre: number; post: number } => p.pre !== null && p.post !== null
  )
  if (both.length === 0) return null
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const averagePre = mean(both.map((p) => p.pre))
  const averagePost = mean(both.map((p) => p.post))
  return {
    learners: both.length,
    averagePre: Math.round(averagePre),
    averagePost: Math.round(averagePost),
    change: Math.round(averagePost - averagePre),
  }
}
