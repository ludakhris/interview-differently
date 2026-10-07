// #69 part E: active time learners spent in online courses, for per-learner and per-cohort daily
// reports and a CSV. There is one kind of time: a session has a start and a duration (seconds of
// active time). Times are stored in UTC; a report is asked for in the viewer's timezone (`tz`, an
// IANA name) and its `day` values are dates in that timezone (YYYY-MM-DD). A session that crosses
// local midnight belongs to the day it started.

/** POST /learn/me/activity/heartbeat, sent about every 30s while the page is visible and the learner active. */
export interface HeartbeatInput {
  cohortId: string
  /** The item being viewed; null or absent for a page that is not an item. */
  itemId?: string | null
  kind: 'page' | 'tool'
}

/** One session: a start (ISO, UTC) and a duration, on the activity it was spent on. */
export interface ActivitySessionRow {
  startedAt: string
  /** Active seconds. */
  seconds: number
  itemId: string | null
  /** The item's name, or the course pages (outline, dashboard) when it was not on an item. */
  title: string
}

/** One learner on one local day. */
export interface ActivityDay {
  /** The day in the report's timezone. */
  day: string
  seconds: number
  /** Start of the day's first session (ISO, UTC). */
  firstSeenAt: string
  /** End of the day's last activity (ISO, UTC). */
  lastSeenAt: string
  sessionCount: number
  /** Oldest first. */
  sessions: ActivitySessionRow[]
}

/** GET /learn/cohorts/:cohortId/activity/learners/:userId and GET /learn/me/cohorts/:cohortId/activity (own). All take ?from&to&tz. */
export interface LearnerActivityReport {
  cohortId: string
  userId: string
  name: string
  from: string
  to: string
  /** The IANA timezone the days are in. */
  tz: string
  totalSeconds: number
  /** Days with any time. */
  activeDays: number
  /** totalSeconds / activeDays; 0 when there are none. */
  averagePerActiveDaySeconds: number
  days: ActivityDay[]
}

export interface CohortActivityLearnerRow {
  userId: string
  name: string
  totalSeconds: number
  activeDays: number
  /** totalSeconds / activeDays; 0 when there are none. */
  averagePerActiveDaySeconds: number
  firstSeenAt: string | null
  lastSeenAt: string | null
}

/** Averages over the report's range. Seconds are whole; learnersPerDay has one decimal. */
export interface ActivityAverages {
  /** Total time / every learner listed, including those with no time. */
  perLearnerSeconds: number
  /** Total time / learners who had any time. */
  perActiveLearnerSeconds: number
  /** Total time / (learner, day) pairs with any time: a typical active day for one learner. */
  perActiveDaySeconds: number
  /** Learners who had any time. */
  activeLearners: number
  /** Learners active on a day, averaged over every day in the range. */
  learnersPerDay: number
}

/** GET /learn/cohorts/:cohortId/activity?from&to&tz */
export interface CohortActivityReport {
  cohortId: string
  from: string
  to: string
  /** The IANA timezone the days are in. */
  tz: string
  totalSeconds: number
  averages: ActivityAverages
  /** Every day in the range, including quiet ones. */
  days: { day: string; seconds: number; learners: number }[]
  learners: CohortActivityLearnerRow[]
  items: { itemId: string | null; title: string; seconds: number; learners: number }[]
}
