// ── Live monitors of Simulator work, read for a cohort ──────────────────────
//
// What the Simulator knows about a cohort's learners while they work: how far through an
// assessment each is, and the SQL they have run. Read-only. The LMS shows it to cohort staff and
// never stores it; the Simulator owns the data and hands it over through a feed (see
// apps/api/src/core/simulator-feed.ts).

export type MonitorStatus = 'not_started' | 'in_progress' | 'submitted'

export interface AssessmentMonitorStudent {
  userId: string
  name: string
  email: string | null
  status: MonitorStatus
  /** Questions with a saved answer, out of those drawn for this learner. */
  answeredCount: number
  questionCount: number
  startedAt: string | null
  submittedAt: string | null
  /** Last autosave or submit. */
  lastActivityAt: string | null
}

export interface AssessmentMonitorDelivery {
  id: string
  /** The heading: the course item's title for a course assessment, else the assessment's own title. */
  label: string
  /** Short chips shown beside the heading: "pre", "post", "attempt 2". */
  tags: string[]
  /** The Simulator's title for the assessment; null for a course item nobody has launched yet. */
  assessmentTitle: string | null
  /** The course item this delivery belongs to; null for one scheduled outside the course. */
  itemId: string | null
  opensAt: string | null
  closesAt: string | null
  timeLimitMinutes: number | null
  counts: { notStarted: number; inProgress: number; submitted: number }
  /** In progress first, then submitted, then not started; names within each. */
  students: AssessmentMonitorStudent[]
}

export interface CohortAssessmentMonitor {
  generatedAt: string
  cohort: { id: string; name: string }
  /** One per course assessment item (and per attempt, for a retake), in course order, even before anyone starts. */
  deliveries: AssessmentMonitorDelivery[]
  /** Assessments scheduled for this cohort directly in the Simulator, outside the course. */
  other: AssessmentMonitorDelivery[]
}

export interface SqlMonitorQuery {
  id: string
  datasetSlug: string
  queryText: string
  ok: boolean
  errorMessage: string | null
  rowCount: number | null
  durationMs: number | null
  createdAt: string
}

export interface SqlMonitorStudent {
  userId: string
  name: string
  email: string | null
  queryCount: number
  errorCount: number
  lastQueryAt: string | null
  /** Newest first. */
  queries: SqlMonitorQuery[]
}

export interface CohortSqlMonitor {
  generatedAt: string
  cohort: { id: string; name: string }
  /** False when the cohort does not use the SQL sandbox, so the monitor has nothing to show. */
  enabled: boolean
  retentionDays: number
  students: SqlMonitorStudent[]
}

/** One learner's attempt on a delivery, with how it was graded. */
export interface AssessmentResultAttempt {
  userId: string
  status: 'in_progress' | 'submitted'
  submittedAt: string | null
  /** Submitted after the deadline. */
  late: boolean
  minutes: number | null
  overall: { correct: number; total: number; percent: number } | null
  sections: { sectionId: string; title: string; correct: number; total: number }[]
}

/** Graded results for one delivery to a cohort. */
export interface AssessmentDeliveryResults {
  deliveryId: string
  expectedMinutes: number | null
  medianMinutes: number | null
  sections: { id: string; title: string }[]
  attempts: AssessmentResultAttempt[]
}
