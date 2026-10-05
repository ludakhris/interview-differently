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
  /** 'agency' | 'provider' | 'organization' | 'academic' */
  kind: string
  subdomain: string
  parentId: string | null
}

// ── Course setup (#46) ──────────────────────────────────────────────────────

export type CourseItemType = 'lesson' | 'knowledge_check' | 'assessment' | 'interview' | 'scorm'
export type CourseStatus = 'draft' | 'published'

export interface KnowledgeCheckQuestion {
  prompt: string
  options: string[]
  correctIndex: number
}

/**
 * `config` by type: lesson { body }, knowledge_check and assessment { questions },
 * interview { scenarioId }, scorm { packageId, entry, version, files }.
 */
export interface CourseItemDto {
  id: string
  moduleId: string
  type: string
  title: string
  position: number
  /** 'pre' or 'post' for assessments, otherwise null. */
  label: string | null
  config: Record<string, unknown>
}

export interface CourseModuleDto {
  id: string
  title: string
  position: number
  items: CourseItemDto[]
}

export interface CourseSettings {
  title: string
  summary: string | null
  sector: string | null
  credential: string | null
  lengthWeeks: number | null
  /** Post-assessment score that counts as meeting the course target. */
  targetScore: number
  /** Best interview score that counts as interview ready. */
  readinessThreshold: number
  status: CourseStatus
}

export interface CourseSummary extends CourseSettings {
  id: string
  slug: string
  modules: number
  items: number
  cohorts: number
  updatedAt: string
}

export interface CourseDetail extends CourseSettings {
  id: string
  slug: string
  provider: { id: string; name: string; subdomain: string }
  cohorts: number
  modules: CourseModuleDto[]
}

export interface ItemInput {
  type: CourseItemType
  title: string
  label?: 'pre' | 'post' | null
  config?: Record<string, unknown>
}

/** New order for a course: modules in order, and each module's items in order. */
export interface CourseOutline {
  moduleIds: string[]
  itemIds: Record<string, string[]>
}

export interface CatalogEntry {
  id: string
  title: string
  detail?: string
}

// ── Cohorts (#46) ───────────────────────────────────────────────────────────

export type CohortStatus = 'upcoming' | 'running' | 'completed'

export interface CohortListItem {
  id: string
  name: string
  courseId: string
  courseTitle: string
  startsAt: string | null
  endsAt: string | null
  status: CohortStatus
  enrolled: number
  /** Learners enter this to join. */
  joinKey: string | null
}

export interface CohortRosterRow {
  enrollmentId: string
  userId: string
  name: string
  email: string | null
  status: 'enrolled' | 'completed' | 'withdrawn'
  enrolledAt: string
  itemsDone: number
  itemsTotal: number
}

export interface CohortDetail extends CohortListItem {
  host: { id: string; name: string; subdomain: string }
  lengthWeeks: number | null
  roster: CohortRosterRow[]
}

/** A course a workspace can start a cohort of: its own published courses and ones offered to it. */
export interface RunnableCourse {
  id: string
  title: string
  provider: string
  lengthWeeks: number | null
}

export interface OfferTarget {
  id: string
  name: string
  subdomain: string
}

export interface CourseOffers {
  offered: OfferTarget[]
  /** Organizations that could be offered this course and have not been yet. */
  available: OfferTarget[]
}

// ── Learner path (#46) ──────────────────────────────────────────────────────

export type ProgressStatus = 'not_started' | 'in_progress' | 'completed'

export interface LearnerCohortCard {
  cohortId: string
  cohortName: string
  courseTitle: string
  host: string
  status: CohortStatus
  startsAt: string | null
  endsAt: string | null
  enrollmentStatus: 'enrolled' | 'completed' | 'withdrawn'
  itemsDone: number
  itemsTotal: number
}

export interface LearnerOutlineItem {
  id: string
  type: string
  title: string
  label: string | null
  status: ProgressStatus
  score: number | null
  attempts: number
}

/** What the learner's own record shows: the same measures the agency reports on. */
export interface ReadinessRecord {
  pre: number | null
  post: number | null
  gain: number | null
  targetScore: number
  reachedTarget: boolean
  interviewBest: number | null
  readinessThreshold: number
  interviewReady: boolean
  completed: boolean
}

export interface LearnerOutline {
  cohort: LearnerCohortCard
  modules: { id: string; title: string; items: LearnerOutlineItem[] }[]
  record: ReadinessRecord
}

/** A question as the learner sees it: no answer key. */
export interface QuizQuestion {
  prompt: string
  options: string[]
}

export interface QuizResult {
  score: number
  correct: boolean[]
  correctIndexes: number[]
}

export interface LearnerItem {
  id: string
  cohortId: string
  type: string
  title: string
  label: string | null
  /** lesson: body. quiz (knowledge check or assessment): questions. interview: scenarioId and scenarioTitle. */
  body: string | null
  questions: QuizQuestion[] | null
  scenario: { id: string; title: string } | null
  /** A SCORM package: where to load it and what the learner saved last time. */
  scorm: { src: string; version: '1.2' | '2004'; cmi: Record<string, unknown> | null } | null
  status: ProgressStatus
  score: number | null
  attempts: number
  /** Set when the learner can still act on it. */
  locked: string | null
}
