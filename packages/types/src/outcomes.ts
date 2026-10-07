// #69 part A: the learner's own outcomes across every cohort and course.
// GET /learn/me/outcomes (any signed-in LearnDifferently account; only ever the caller's own data).

import type { CohortStatus, ReadinessRecord } from './learn'

/** One skill a course builds, as this learner stands on it. */
export interface LearnerOutcomeSkill {
  id: string
  label: string
  /** Share of this skill's questions answered correctly (0-100); null until the learner has answered any. */
  pct: number | null
  targetPct: number
  /** pct is below targetPct. */
  flagged: boolean
}

/** One course item and what the learner did on it. */
export interface LearnerOutcomeItem {
  itemId: string
  title: string
  type: string
  status: 'not_started' | 'in_progress' | 'completed'
  /** Best score (0-100); null for items that are not scored. */
  score: number | null
  attempts: number
  completedAt: string | null
  /** A "Review: ..." row: ordinary content the learner must do again. Its score duplicates the original row. */
  review: boolean
  /** The course's pre-check (its score is a starting point, not an outcome). */
  preCheck: boolean
}

export interface LearnerOutcomeCohort {
  cohortId: string
  cohortName: string
  courseTitle: string
  /** The workspace that runs the cohort. */
  host: string
  status: CohortStatus
  enrollmentStatus: 'enrolled' | 'completed' | 'withdrawn'
  startsAt: string | null
  endsAt: string | null
  completedAt: string | null
  itemsDone: number
  itemsTotal: number
  /** itemsDone / itemsTotal as a whole percent. */
  percent: number
  readiness: ReadinessRecord
  /** The course has something that counts as an interview, so completion needs interview readiness. */
  hasInterview: boolean
  skills: LearnerOutcomeSkill[]
  items: LearnerOutcomeItem[]
}

export interface LearnerOutcomes {
  generatedAt: string
  totals: {
    cohorts: number
    completedCohorts: number
    itemsDone: number
    itemsTotal: number
    /** Attempts on scored items (items with a score), across all courses. */
    attempts: number
  }
  /** Newest cohort first. Withdrawn enrollments are left out. */
  cohorts: LearnerOutcomeCohort[]
}
