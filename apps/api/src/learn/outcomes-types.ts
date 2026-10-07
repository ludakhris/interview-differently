// GENERATED COPY of packages/types/src/outcomes.ts. Do not edit here.
// Edit the original, then run: npm run sync:types --workspace @id/api
// (The API build has no access to packages/, so it carries its own copy.)

// #69 part A: the learner's own outcomes across every cohort and course.
// GET /learn/me/outcomes (any signed-in LearnDifferently account; only ever the caller's own data).

import type { CohortStatus, ReadinessRecord } from './learn-types'

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
    /** Scored attempts across all items. */
    attempts: number
  }
  /** Newest cohort first. Withdrawn enrollments are left out. */
  cohorts: LearnerOutcomeCohort[]
}
