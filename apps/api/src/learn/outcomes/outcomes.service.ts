import { Injectable } from '@nestjs/common'
import type {
  LearnerOutcomeCohort,
  LearnerOutcomeItem,
  LearnerOutcomes,
  LearnerOutcomeSkill,
} from '../outcomes-types'
import type { CohortStatus } from '../learn-types'
import { PrismaService } from '../../prisma/prisma.service'
import { cohortStatus } from '../cohort-config'
import { isSupportedItemType } from '../course-config'
import { buildRecord } from '../learner.service'
import { isInterviewLike } from '../../lti/platform/lti-platform-config'
import { doneSince, parseSkills, remediationOf, skillResults } from '../skills'
import { DataAccessLogService } from '../data-access-log.service'
import { ProviderAccessService } from '../provider-access.service'

/** #69 A: a learner's own outcomes. Reads only the caller's enrollments; never staff data or compensation. */
@Injectable()
export class OutcomesService {
  constructor(
    readonly prisma: PrismaService,
    readonly access: ProviderAccessService,
    readonly audit: DataAccessLogService
  ) {}

  /**
   * Every non-withdrawn enrollment of this learner, newest first. Progress, the plan, the record
   * and the skills follow the same rules as the course outline (LearnerService.outline).
   */
  async mine(userId: string, now: Date = new Date()): Promise<LearnerOutcomes> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, status: { not: 'withdrawn' }, cohort: { courseId: { not: null } } },
      include: {
        cohort: {
          include: {
            institution: { select: { name: true } },
            course: true,
          },
        },
        progress: true,
        plan: true,
      },
      orderBy: { enrolledAt: 'desc' },
    })
    const courseIds = [
      ...new Set(enrollments.map((e) => e.cohort.course?.id).filter((x): x is string => !!x)),
    ]
    const modules =
      courseIds.length === 0
        ? []
        : await this.prisma.courseModule.findMany({
            where: { courseId: { in: courseIds } },
            orderBy: { position: 'asc' },
            include: { items: { orderBy: { position: 'asc' } } },
          })
    const itemsOf = (courseId: string) =>
      modules
        .filter((m) => m.courseId === courseId)
        .flatMap((m) => m.items)
        // A stored item of a type that is no longer supported is skipped, as in the outline.
        .filter((i) => isSupportedItemType(i.type))

    const cohorts: LearnerOutcomeCohort[] = enrollments.flatMap((e) => {
      const course = e.cohort.course
      if (!course) return []
      const all = itemsOf(course.id)
      const byItem = new Map(e.progress.map((p) => [p.itemId, p]))
      const ordinary = all.filter((i) => !remediationOf(i.config))
      const added = e.plan.flatMap((p) => {
        const i = all.find((x) => x.id === p.itemId)
        return i ? [{ item: i, since: p.createdAt, review: !remediationOf(i.config) }] : []
      })

      const row = (
        i: { id: string; title: string; type: string; label: string | null },
        status: LearnerOutcomeItem['status'],
        title = i.title,
        review = false
      ): LearnerOutcomeItem => {
        const p = byItem.get(i.id)
        return {
          itemId: i.id,
          title,
          type: i.type,
          status,
          score: p?.score ?? null,
          attempts: p?.attempts ?? 0,
          completedAt: p?.completedAt?.toISOString() ?? null,
          review,
          preCheck: i.label === 'pre',
        }
      }
      const plain = (id: string): LearnerOutcomeItem['status'] =>
        (byItem.get(id)?.status as LearnerOutcomeItem['status'] | undefined) ?? 'not_started'
      const items = [
        ...ordinary.map((i) => row(i, plain(i.id))),
        ...added.map((a) =>
          row(
            a.item,
            // Done for the plan only if completed since it was added: a review means doing it again.
            doneSince(byItem.get(a.item.id), a.since) ? 'completed' : 'not_started',
            a.review ? `Review: ${a.item.title}` : a.item.title,
            a.review
          )
        ),
      ]
      const itemsDone = items.filter((i) => i.status === 'completed').length
      const itemsTotal = items.length

      const skills: LearnerOutcomeSkill[] = skillResults(
        parseSkills(course.skills),
        all,
        byItem
      ).map((s) => ({
        id: s.skillId,
        label: s.label,
        pct: s.pct,
        targetPct: s.targetPct,
        flagged: s.status === 'gap',
      }))

      return [
        {
          cohortId: e.cohortId,
          cohortName: e.cohort.name,
          courseTitle: course.title,
          host: e.cohort.institution.name,
          status: cohortStatus(e.cohort.startsAt, e.cohort.endsAt) as CohortStatus,
          enrollmentStatus: e.status as LearnerOutcomeCohort['enrollmentStatus'],
          startsAt: e.cohort.startsAt?.toISOString() ?? null,
          endsAt: e.cohort.endsAt?.toISOString() ?? null,
          completedAt: e.completedAt?.toISOString() ?? null,
          itemsDone,
          itemsTotal,
          percent: itemsTotal === 0 ? 0 : Math.round((itemsDone / itemsTotal) * 100),
          hasInterview: all.some((i) => isInterviewLike(i)),
          readiness: buildRecord(ordinary, e.progress, course, e.status === 'completed'),
          skills,
          items,
        },
      ]
    })

    return {
      generatedAt: now.toISOString(),
      totals: {
        cohorts: cohorts.length,
        completedCohorts: cohorts.filter((c) => c.enrollmentStatus === 'completed').length,
        itemsDone: cohorts.reduce((n, c) => n + c.itemsDone, 0),
        itemsTotal: cohorts.reduce((n, c) => n + c.itemsTotal, 0),
        attempts: enrollments.reduce(
          (n, e) => n + e.progress.reduce((m, p) => m + (p.score !== null ? p.attempts : 0), 0),
          0
        ),
      },
      cohorts,
    }
  }
}
