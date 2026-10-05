// ── LearnDifferently: agency outcomes (#46, #48, #50) ───────────────────────
// Shapes returned by the API's /learn/agency/* endpoints. Rates are 0-1,
// scores 0-100, dates ISO strings.

export interface LearnMeasures {
  enrolled: number
  completed: number
  /** Completed / enrolled over finished cohorts only; null while nothing has finished. */
  completionRate: number | null
  preAssessed: number
  postAssessed: number
  avgPre: number | null
  avgPost: number | null
  /** Mean pre→post change over learners with both scores, in points. */
  avgGain: number | null
  /** Learners whose post-assessment score meets the course's target score. */
  reachedTarget: number
  /** Share of finished-cohort learners who reached the target; null while nothing has finished. */
  targetRate: number | null
  /** Learners whose best interview score meets the course's readiness threshold. */
  interviewReady: number
  /** interviewReady / enrolled. */
  readyRate: number | null
}

export interface OutcomesProviderRow extends LearnMeasures {
  providerId: string
  provider: string
  program: string
  credential: string | null
  cohorts: number
}

export interface OutcomesCohortRow extends LearnMeasures {
  cohortId: string
  cohort: string
  providerId: string
  provider: string
  /** Institution that runs the cohort (a provider, or a member organization). */
  host: string
  program: string
  startsAt: string | null
  endsAt: string | null
  status: 'running' | 'completed'
  readinessThreshold: number
  targetScore: number
}

export interface FunnelStage {
  key: 'enrolled' | 'preAssessed' | 'interviewed' | 'postAssessed' | 'completed'
  label: string
  count: number
}

export interface AgencyOutcomes {
  agency: { id: string; name: string }
  asOf: string
  totals: LearnMeasures
  providers: OutcomesProviderRow[]
  cohorts: OutcomesCohortRow[]
  /** Participants in finished cohorts only. */
  funnel: FunnelStage[]
}

export interface GradebookRow {
  enrollmentId: string
  userId: string
  name: string
  status: 'enrolled' | 'completed' | 'withdrawn'
  pre: number | null
  post: number | null
  gain: number | null
  interviewBest: number | null
  interviewAttempts: number
  reachedTarget: boolean
  interviewReady: boolean
  itemsDone: number
  itemsTotal: number
  lastActivity: string | null
}

export interface Gradebook {
  cohort: OutcomesCohortRow
  learners: GradebookRow[]
}

/** A tenant the signed-in person may open, e.g. an agency such as the Delaware Department of Labor. */
export interface LearnWorkspace {
  id: string
  name: string
  kind: string
  subdomain: string
}
