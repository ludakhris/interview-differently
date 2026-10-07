import type { LearnerOutcomeCohort, LearnerOutcomeItem, LearnerOutcomes } from '@id/types'

/** A score with its unit, or plain words when there is none yet (never a made-up 0%). */
export const scoreText = (n: number | null): string =>
  n === null ? 'Not yet' : `${Math.round(n)}%`

export const attemptsText = (n: number): string =>
  n === 0 ? 'No attempts yet' : n === 1 ? '1 attempt' : `${n} attempts`

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)

/** Average of the best score on every scored item, across all courses; null until any is scored. */
export function averageScore(data: LearnerOutcomes): number | null {
  return mean(
    data.cohorts.flatMap((c) => c.items.flatMap((i) => (i.score === null ? [] : [i.score])))
  )
}

/** How many of the learner's courses show interview readiness, in words. */
export function readinessSummary(data: LearnerOutcomes): string {
  const n = data.cohorts.length
  if (n === 0) return 'Not yet'
  const ready = data.cohorts.filter((c) => c.readiness.interviewReady).length
  if (ready === 0) return 'Not yet'
  return `${ready} of ${n}`
}

/** Where a course stands. Completion needs every item done and interview readiness reached. */
export function completionText(c: LearnerOutcomeCohort): string {
  if (c.enrollmentStatus === 'completed') return 'Completed'
  const allDone = c.itemsTotal > 0 && c.itemsDone >= c.itemsTotal
  if (allDone && !c.readiness.interviewReady) {
    return `All items done. To complete, reach ${c.readiness.readinessThreshold}% on a practice interview.`
  }
  if (c.itemsDone === 0) return 'Not started'
  return 'In progress'
}

export function readinessText(c: LearnerOutcomeCohort): string {
  const r = c.readiness
  if (r.interviewBest === null) return `Not yet (goal ${r.readinessThreshold}%)`
  return r.interviewReady
    ? `Ready: best interview ${scoreText(r.interviewBest)}`
    : `Not yet: best interview ${scoreText(r.interviewBest)}, goal ${r.readinessThreshold}%`
}

export type SkillState = 'not_yet' | 'needs_work' | 'on_track'

export function skillState(s: { pct: number | null; flagged: boolean }): SkillState {
  return s.pct === null ? 'not_yet' : s.flagged ? 'needs_work' : 'on_track'
}

export const skillStateLabel: Record<SkillState, string> = {
  not_yet: 'Not yet',
  needs_work: 'Needs work',
  on_track: 'On track',
}

export interface RecentResult {
  cohortId: string
  courseTitle: string
  itemId: string
  title: string
  score: number | null
  at: string
}

/** The most recently completed items across every course, newest first. */
export function recentResults(data: LearnerOutcomes, limit = 8): RecentResult[] {
  const rows: RecentResult[] = data.cohorts.flatMap((c) =>
    c.items.flatMap((i: LearnerOutcomeItem) =>
      i.completedAt && i.status === 'completed'
        ? [
            {
              cohortId: c.cohortId,
              courseTitle: c.courseTitle,
              itemId: i.itemId,
              title: i.title,
              score: i.score,
              at: i.completedAt,
            },
          ]
        : []
    )
  )
  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}

/** Items that have a score, in course order. */
export const scoredItems = (c: LearnerOutcomeCohort): LearnerOutcomeItem[] =>
  c.items.filter((i) => i.score !== null)

export const itemStatusLabel = (s: LearnerOutcomeItem['status']): string =>
  s === 'completed' ? 'Done' : s === 'in_progress' ? 'In progress' : 'Not started'
