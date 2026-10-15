import { Injectable } from '@nestjs/common'
import type { SimulatorFeed } from '../../core/simulator-feed'
import type {
  AssessmentDeliveryResults,
  CheckpointEvidence,
  CheckpointHistoryEntry,
  CohortAssessmentMonitor,
  CohortSqlMonitor,
} from '../../core/monitor-types'
import type { CheckpointHelpKind } from '../../core/checkpoint-types'
import { PrismaService } from '../../prisma/prisma.service'
import { AssessmentsService } from '../assessments/assessments.service'
import type { AssessmentSection } from '../assessments/assessment.types'
import { questionIndex } from '../assessments/parse-markdown'
import { GEN_PREFIX, type StoredTask } from '../checkpoints/checkpoints.service'
import { ToolsService } from '../tools/tools.service'

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Gives the LMS read-only views of Simulator data, in the shape the feed port promises. */
@Injectable()
export class SimulatorFeedService implements SimulatorFeed {
  constructor(
    private readonly assessments: AssessmentsService,
    private readonly tools: ToolsService,
    private readonly prisma: PrismaService
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

  async checkpointEvidence(cohortId: string, userIds?: string[]): Promise<CheckpointEvidence[]> {
    if (userIds && userIds.length === 0) return []
    const rows = await this.prisma.practiceEvent.findMany({
      where: { cohortId, kind: 'answer', ...(userIds ? { userId: { in: userIds } } : {}) },
      orderBy: { createdAt: 'asc' },
      select: {
        userId: true,
        itemId: true,
        ref: true,
        correct: true,
        passed: true,
        createdAt: true,
      },
    })
    return rows.map((r) => ({
      userId: r.userId,
      itemId: r.itemId,
      ref: r.ref,
      correct: r.correct === true,
      passed: r.passed,
      at: r.createdAt.toISOString(),
    }))
  }

  async checkpointHistory(cohortId: string, userId: string): Promise<CheckpointHistoryEntry[]> {
    const [events, uses] = await Promise.all([
      this.prisma.practiceEvent.findMany({
        where: { cohortId, userId },
        orderBy: { createdAt: 'asc' },
        select: {
          kind: true,
          itemId: true,
          ref: true,
          correct: true,
          passed: true,
          data: true,
          createdAt: true,
          delivery: { select: { assessmentId: true } },
        },
      }),
      this.prisma.practiceSetUse.findMany({
        where: { cohortId, userId },
        orderBy: { createdAt: 'asc' },
        include: { practiceSet: { select: { intro: true, tasks: true } } },
      }),
    ])
    // The requests' wording: bank questions from the delivery's bank, generated ones from their practice set.
    const bankIds = [
      ...new Set(events.flatMap((e) => (e.delivery ? [e.delivery.assessmentId] : []))),
    ]
    const setIds = [
      ...new Set(
        events.flatMap((e) => (e.ref.startsWith(GEN_PREFIX) ? [e.ref.split(':')[1] ?? ''] : []))
      ),
    ]
    const [banks, sets] = await Promise.all([
      bankIds.length
        ? this.prisma.assessment.findMany({
            where: { id: { in: bankIds } },
            select: { id: true, sections: true },
          })
        : [],
      setIds.length
        ? this.prisma.practiceSet.findMany({
            where: { id: { in: setIds } },
            select: { id: true, tasks: true },
          })
        : [],
    ])
    const index = new Map(
      banks.map((b) => [b.id, questionIndex(b.sections as unknown as AssessmentSection[])])
    )
    const setTasks = new Map(sets.map((s) => [s.id, s.tasks as unknown as StoredTask[]]))
    const wording = (ref: string, bankId: string | undefined) => {
      if (ref.startsWith(GEN_PREFIX)) {
        const [, id, n] = ref.split(':')
        return { prompt: setTasks.get(id)?.[Number(n)]?.prompt ?? '', from: null }
      }
      const q = bankId ? index.get(bankId)?.get(ref) : undefined
      return {
        prompt: q?.prompt ?? '',
        from: q && q.type === 'sql' ? (q.from ?? null) : null,
      }
    }
    const out: CheckpointHistoryEntry[] = []
    for (const e of events) {
      const d = (e.data ?? {}) as Record<string, unknown>
      const at = e.createdAt.toISOString()
      if (e.kind === 'answer')
        out.push({
          kind: 'answer',
          at,
          itemId: e.itemId,
          ref: e.ref,
          ...wording(e.ref, e.delivery?.assessmentId),
          sql: e.passed ? null : str(d.sql),
          correct: e.correct === true,
          passed: e.passed,
          reason: str(d.reason) ?? str(d.error),
        })
      else if (e.kind === 'help')
        out.push({
          kind: 'help',
          at,
          itemId: e.itemId,
          ref: e.ref,
          helpKind: (str(d.kind) ?? 'hint') as CheckpointHelpKind,
          text: str(d.text) ?? '',
          exampleSql: str(d.exampleSql),
        })
    }
    for (const u of uses)
      out.push({
        kind: 'practice',
        at: u.createdAt.toISOString(),
        itemId: u.itemId,
        intro: u.practiceSet.intro,
        tasks: (u.practiceSet.tasks as unknown as StoredTask[]).map((t) => t.prompt),
      })
    // Stable: what happened at the same moment keeps its order (events first, then practice).
    return out
      .map((entry, i) => ({ entry, i }))
      .sort((a, b) => a.entry.at.localeCompare(b.entry.at) || a.i - b.i)
      .map((x) => x.entry)
  }
}
