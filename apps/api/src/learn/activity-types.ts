// GENERATED COPY of packages/types/src/activity.ts. Do not edit here.
// Edit the original, then run: npm run sync:types --workspace @id/api
// (The API build has no access to packages/, so it carries its own copy.)

// #69 part E: active time learners spent in online courses, for per-learner and per-cohort daily
// reports and a grant-reporting CSV. Days are UTC dates (YYYY-MM-DD).
//
// Two kinds of time are always kept apart. MEASURED is active time on learner pages: a heartbeat
// counted only while the page was visible and the learner had used it in the last minute (idle
// time is not counted). ESTIMATED is a connected tool's time, a guess from launch to score return.
// The two can overlap (a learner may have a course page open while a tool runs), so they are never
// merged without saying so. totalSeconds is always measuredSeconds + estimatedSeconds.

/** POST /learn/me/activity/heartbeat, sent about every 30s while the page is visible and the learner active. */
export interface HeartbeatInput {
  cohortId: string
  /** The item being viewed; null or absent for a page that is not an item. */
  itemId?: string | null
  kind: 'page' | 'tool'
}

/** Seconds of one kind of time, split into measured and estimated. */
export interface ActivitySeconds {
  /** measuredSeconds + estimatedSeconds. */
  seconds: number
  /** Active time measured on learner pages. */
  measuredSeconds: number
  /** A connected tool's time, estimated from launch to score return. */
  estimatedSeconds: number
}

/** One learner on one day: total, and what it was spent on. */
export interface ActivityDay extends ActivitySeconds {
  day: string
  firstSeenAt: string
  lastSeenAt: string
  items: ({ itemId: string | null; title: string } & ActivitySeconds)[]
}

/** GET /learn/cohorts/:cohortId/activity/learners/:userId and GET /learn/me/cohorts/:cohortId/activity (own). */
export interface LearnerActivityReport {
  cohortId: string
  userId: string
  name: string
  from: string
  to: string
  /** measuredSeconds + estimatedSeconds. */
  totalSeconds: number
  measuredSeconds: number
  estimatedSeconds: number
  activeDays: number
  days: ActivityDay[]
}

export interface CohortActivityLearnerRow {
  userId: string
  name: string
  /** measuredSeconds + estimatedSeconds. */
  totalSeconds: number
  measuredSeconds: number
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
  /** measuredSeconds + estimatedSeconds. */
  totalSeconds: number
  measuredSeconds: number
  estimatedSeconds: number
  /** Every day in the range, including quiet ones. */
  days: ({ day: string; learners: number } & ActivitySeconds)[]
  learners: CohortActivityLearnerRow[]
  items: ({ itemId: string | null; title: string; learners: number } & ActivitySeconds)[]
}
