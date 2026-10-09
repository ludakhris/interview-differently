import type { AssessmentImprovement, AssessmentLearnerStatus } from '@id/types'

export const STATUS_WORDS: Record<AssessmentLearnerStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
}

/** "+25 pts" / "-10 pts" / "0 pts": the change from pre to post. */
export const changeText = (points: number): string =>
  points > 0 ? `+${points} pts` : points < 0 ? `−${Math.abs(points)} pts` : '0 pts'

/** "50% → 75% over 12 learners", the detail behind a change. */
export const improvementDetail = (i: AssessmentImprovement): string =>
  `${i.averagePre}% → ${i.averagePost}% over ${i.learners} ${i.learners === 1 ? 'learner' : 'learners'}`

/** "82%", or a dash when there is no score. */
export const percentText = (n: number | null): string => (n === null ? '—' : `${n}%`)

/** "12 min", or a dash. */
export const minutesText = (n: number | null): string => (n === null ? '—' : `${n} min`)

/** A file-name-safe version of an assessment title: "Post-assessment" becomes "post-assessment". */
export const fileSlug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'assessment'

/** "3/4", or a dash when the learner has no score on the section. */
export const sectionText = (s: { correct: number; total: number } | undefined): string =>
  s ? `${s.correct}/${s.total}` : '—'
