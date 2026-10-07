// #69 part E: time learners spent in online courses, for per-learner and per-cohort daily reports
// and grant-reporting CSV. Days are UTC dates (YYYY-MM-DD).

/** POST /learn/me/activity/heartbeat, sent about every 30s while the page is visible and the learner active. */
export interface HeartbeatInput {
  cohortId: string
  /** The item being viewed; null or absent for a page that is not an item. */
  itemId?: string | null
  kind: 'page' | 'tool'
}

/** One learner on one day: total, and what it was spent on. */
export interface ActivityDay {
  day: string
  seconds: number
  firstSeenAt: string
  lastSeenAt: string
  items: { itemId: string | null; title: string; seconds: number; estimated: boolean }[]
}

/** GET /learn/cohorts/:cohortId/activity/learners/:userId and GET /learn/me/cohorts/:cohortId/activity (own). */
export interface LearnerActivityReport {
  cohortId: string
  userId: string
  name: string
  from: string
  to: string
  totalSeconds: number
  activeDays: number
  days: ActivityDay[]
}

export interface CohortActivityLearnerRow {
  userId: string
  name: string
  totalSeconds: number
  /** Part of totalSeconds that was estimated rather than measured. */
  estimatedSeconds: number
  activeDays: number
  firstSeenAt: string | null
  lastSeenAt: string | null
}

/** GET /learn/cohorts/:cohortId/activity?from&to */
export interface CohortActivityReport {
  cohortId: string
  from: string
  to: string
  totalSeconds: number
  /** Every day in the range, including quiet ones. */
  days: { day: string; seconds: number; learners: number }[]
  learners: CohortActivityLearnerRow[]
  items: { itemId: string | null; title: string; seconds: number; learners: number }[]
}
