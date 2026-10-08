import type {
  AgencyOutcomes,
  FunnelStage,
  Gradebook,
  GradebookRow,
  LearnMeasures,
  OutcomesCohortRow,
  OutcomesProviderRow,
} from './learn-types'

/** One enrollment with the results rolled up from its item progress. */
export interface EnrollmentRow {
  enrollmentId: string
  userId: string
  name: string | null
  status: string
  completedAt: Date | null
  cohortId: string
  cohortName: string
  startsAt: Date | null
  endsAt: Date | null
  hostId: string
  hostName: string
  courseId: string
  program: string
  credential: string | null
  readinessThreshold: number
  targetScore: number
  providerId: string
  providerName: string
  pre: number | null
  post: number | null
  interviewBest: number | null
  interviewAttempts: number
  itemsDone: number
  itemsTotal: number
  lastActivity: Date | null
}

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
const rate = (n: number, d: number): number | null =>
  d === 0 ? null : Math.round((n / d) * 1000) / 1000

export const isReady = (r: EnrollmentRow): boolean =>
  r.interviewBest !== null && r.interviewBest >= r.readinessThreshold

export const reachedTarget = (r: EnrollmentRow): boolean =>
  r.post !== null && r.post >= r.targetScore

export const isFinished = (r: EnrollmentRow, now: Date): boolean =>
  r.endsAt !== null && r.endsAt.getTime() <= now.getTime()

export function measures(rows: EnrollmentRow[], now: Date): LearnMeasures {
  const finished = rows.filter((r) => isFinished(r, now))
  const pre = rows.filter((r) => r.pre !== null)
  const post = rows.filter((r) => r.post !== null)
  const both = rows.filter((r) => r.pre !== null && r.post !== null)
  const ready = rows.filter(isReady).length
  return {
    enrolled: rows.length,
    completed: rows.filter((r) => r.status === 'completed').length,
    completionRate: rate(finished.filter((r) => r.status === 'completed').length, finished.length),
    preAssessed: pre.length,
    postAssessed: post.length,
    avgPre: mean(pre.map((r) => r.pre as number)),
    avgPost: mean(post.map((r) => r.post as number)),
    avgGain: mean(both.map((r) => (r.post as number) - (r.pre as number))),
    reachedTarget: rows.filter(reachedTarget).length,
    targetRate: rate(finished.filter(reachedTarget).length, finished.length),
    interviewReady: ready,
    readyRate: rate(ready, rows.length),
  }
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    const list = out.get(k)
    if (list) list.push(r)
    else out.set(k, [r])
  }
  return out
}

export function cohortRows(rows: EnrollmentRow[], now: Date): OutcomesCohortRow[] {
  return [...groupBy(rows, (r) => r.cohortId).values()]
    .map((g) => {
      const f = g[0]
      return {
        ...measures(g, now),
        cohortId: f.cohortId,
        cohort: f.cohortName,
        providerId: f.providerId,
        provider: f.providerName,
        host: f.hostName,
        hostId: f.hostId,
        program: f.program,
        startsAt: f.startsAt?.toISOString() ?? null,
        endsAt: f.endsAt?.toISOString() ?? null,
        status: isFinished(f, now) ? ('completed' as const) : ('running' as const),
        readinessThreshold: f.readinessThreshold,
        targetScore: f.targetScore,
      }
    })
    .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''))
}

export function providerRows(rows: EnrollmentRow[], now: Date): OutcomesProviderRow[] {
  return [...groupBy(rows, (r) => r.providerId).values()]
    .map((g) => {
      const f = g[0]
      const programs = new Set(g.map((r) => r.courseId)).size
      return {
        ...measures(g, now),
        providerId: f.providerId,
        provider: f.providerName,
        // Program and credential belong to one course, so several courses get a count instead.
        program: programs > 1 ? `${programs} programs` : f.program,
        credential: programs > 1 ? null : f.credential,
        cohorts: new Set(g.map((r) => r.cohortId)).size,
      }
    })
    .sort((a, b) => a.provider.localeCompare(b.provider))
}

export function funnel(rows: EnrollmentRow[]): FunnelStage[] {
  return [
    { key: 'enrolled', label: 'Enrolled', count: rows.length },
    { key: 'preAssessed', label: 'Pre-assessed', count: rows.filter((r) => r.pre !== null).length },
    {
      key: 'interviewed',
      label: 'Practised an interview',
      count: rows.filter((r) => r.interviewBest !== null).length,
    },
    {
      key: 'postAssessed',
      label: 'Post-assessed',
      count: rows.filter((r) => r.post !== null).length,
    },
    {
      key: 'completed',
      label: 'Completed',
      count: rows.filter((r) => r.status === 'completed').length,
    },
  ]
}

export function agencyOutcomes(
  agency: { id: string; name: string },
  rows: EnrollmentRow[],
  now: Date
): AgencyOutcomes {
  return {
    agency,
    asOf: now.toISOString(),
    totals: measures(rows, now),
    providers: providerRows(rows, now),
    cohorts: cohortRows(rows, now),
    // Only finished cohorts: a running cohort hasn't had the chance to reach later stages.
    funnel: funnel(rows.filter((r) => isFinished(r, now))),
  }
}

export function gradebook(cohortId: string, rows: EnrollmentRow[], now: Date): Gradebook | null {
  const mine = rows.filter((r) => r.cohortId === cohortId)
  if (mine.length === 0) return null
  const learners: GradebookRow[] = mine
    .map((r) => ({
      enrollmentId: r.enrollmentId,
      userId: r.userId,
      name: r.name ?? r.userId,
      status: r.status as GradebookRow['status'],
      pre: r.pre,
      post: r.post,
      gain: r.pre !== null && r.post !== null ? r.post - r.pre : null,
      interviewBest: r.interviewBest,
      interviewAttempts: r.interviewAttempts,
      reachedTarget: reachedTarget(r),
      interviewReady: isReady(r),
      itemsDone: r.itemsDone,
      itemsTotal: r.itemsTotal,
      lastActivity: r.lastActivity?.toISOString() ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { cohort: cohortRows(mine, now)[0], learners }
}
