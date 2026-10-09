import { Injectable } from '@nestjs/common'
import type { SimulatorFeed } from '../core/simulator-feed'
import type {
  AssessmentDeliveryResults,
  CohortAssessmentMonitor,
  CohortSqlMonitor,
} from '../core/monitor-types'
import { AssessmentsService } from '../assessments/assessments.service'
import { ToolsService } from '../tools/tools.service'

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)

/** Gives the LMS read-only views of Simulator data, in the shape the feed port promises. */
@Injectable()
export class SimulatorFeedService implements SimulatorFeed {
  constructor(
    private readonly assessments: AssessmentsService,
    private readonly tools: ToolsService
  ) {}

  async assessmentMonitor(
    institutionId: string,
    cohortId: string
  ): Promise<CohortAssessmentMonitor> {
    const r = await this.assessments.cohortActivity(institutionId, cohortId)
    return {
      generatedAt: iso(r.generatedAt) as string,
      cohort: r.cohort,
      other: [],
      deliveries: r.deliveries.map((d) => ({
        id: d.id,
        label: d.label,
        tags: [],
        assessmentTitle: d.assessmentTitle,
        itemId: null,
        opensAt: iso(d.opensAt),
        closesAt: iso(d.closesAt),
        timeLimitMinutes: d.timeLimitMinutes,
        counts: d.counts,
        students: d.students.map((s) => ({
          userId: s.userId,
          name: s.name,
          email: s.email,
          status: s.status,
          answeredCount: s.answeredCount,
          questionCount: s.questionCount,
          startedAt: iso(s.startedAt),
          submittedAt: iso(s.submittedAt),
          lastActivityAt: iso(s.lastActivityAt),
        })),
      })),
    }
  }

  async assessmentResults(
    cohortId: string,
    deliveryId: string
  ): Promise<AssessmentDeliveryResults> {
    const r = await this.assessments.cohortDeliveryResults(cohortId, deliveryId)
    return {
      deliveryId,
      expectedMinutes: r.delivery.expectedMinutes,
      medianMinutes: r.delivery.medianMinutes,
      sections: r.sections,
      attempts: r.attempts.map((a) => ({
        userId: a.userId,
        status: a.submittedAt ? 'submitted' : 'in_progress',
        submittedAt: iso(a.submittedAt),
        late: a.submittedLate,
        minutes: a.minutes,
        overall: a.overall,
        sections: (a.sectionScores ?? []).map(({ sectionId, title, correct, total }) => ({
          sectionId,
          title,
          correct,
          total,
        })),
      })),
    }
  }

  async sqlMonitor(cohortId: string): Promise<CohortSqlMonitor> {
    const [activity, tools] = await Promise.all([
      this.tools.sandboxActivity(cohortId),
      this.tools.listForCohort(cohortId),
    ])
    return {
      generatedAt: activity.generatedAt,
      cohort: activity.cohort,
      enabled: tools.some((t) => t.toolKey === 'sql-sandbox' && t.enabled),
      retentionDays: activity.retentionDays,
      students: activity.students,
    }
  }
}
