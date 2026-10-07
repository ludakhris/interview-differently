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

/** A workspace as shown on the chooser: who it reports to, and what is in it. */
export interface LearnWorkspaceSummary extends LearnWorkspace {
  parentName: string | null
  /** Courses it authors (providers), or those authored by the providers under it (agencies). */
  courses: number
  /** Cohorts it runs or that run its courses; for an agency, every cohort under it. */
  cohorts: number
  /** Learners enrolled in those cohorts, withdrawn ones not counted. */
  learners: number
  /** Providers that report to it (agencies only). */
  providers: number
  /** Organizations and academic institutions that report to it (agencies only). */
  organizations: number
}

// ── Course setup (#46) ──────────────────────────────────────────────────────

export type CourseItemType =
  | 'lesson'
  | 'knowledge_check'
  | 'interview'
  | 'scorm'
  | 'video'
  | 'external_link'
  | 'tool'
export type CourseStatus = 'draft' | 'published'

export interface KnowledgeCheckQuestion {
  /** Stable id (assigned when saved) so a learner's per-question results can be tied to it. */
  id?: string
  prompt: string
  options: string[]
  correctIndex: number
  /** A course skill id: a wrong answer counts against that skill. */
  skill?: string
}

/** A skill the course builds. Below `targetPct` the learner is flagged and remediation is added. */
export interface CourseSkill {
  id: string
  label: string
  targetPct: number
}

/**
 * `config` by type: lesson { body }, knowledge_check { questions },
 * interview { role, questions, skill? }, scorm { packageId, entry, version, files },
 * video { provider: 'youtube', videoId, startSeconds? },
 * external_link { url, summary?, instructions?, imageKey? } (authors also receive `imageUrl`),
 * tool { toolId, ref, skill?, maxAttempts?, timeLimitMinutes? } (an LTI tool launched from the course; it reports a score back). A
 * tool item whose tool is an assessment may carry the pre or post label and then stands in for the
 * course's own assessment; any other tool item is interview-like.
 * Any item except an interview or tool may carry `remediationFor` (a skill id): it is then
 * extra content, kept out of the outline and added to a learner's plan when that skill is flagged.
 * Or `reviewFor`: it stays in the outline and is also added back to a flagged learner's plan, who
 * must complete it again.
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
  /** What a learner will be able to do after the course. Shown in the catalog. */
  outcomes: string[]
  /** Jobs the course prepares for. Shown in the catalog. */
  targetRoles: string[]
  /** Skills the course builds, each with a pass mark. */
  skills: CourseSkill[]
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
  /** Most learners that may be enrolled. Null = no limit. */
  maxLearners: number | null
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

/** Content added to this learner's plan because a skill was flagged. Required for completion. */
export interface LearnerAddedItem extends LearnerOutlineItem {
  /** `sourceItemId`: the check or interview whose result added it, so it can be shown beside it. */
  reason: { skill: string; pct: number; n: number; sourceItemId: string | null }
  /** True when it is ordinary course content the learner must complete again, not extra content. */
  review: boolean
}

/** What a scored attempt just added to the plan, for the result screen. */
export interface PlanAddition {
  itemId: string
  type: string
  title: string
  skill: string
  pct: number
  n: number
  review: boolean
}

export interface LearnerOutline {
  cohort: LearnerCohortCard
  modules: { id: string; title: string; items: LearnerOutlineItem[] }[]
  /** Items the learner's results added to the course outline. */
  added: LearnerAddedItem[]
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
  /** lesson: body. knowledge check: questions. interview: see `interview`. */
  body: string | null
  questions: QuizQuestion[] | null
  /** A SCORM package: where to load it and what the learner saved last time. */
  scorm: { src: string; version: '1.2' | '2004'; cmi: Record<string, unknown> | null } | null
  interview: LearnerInterview | null
  /** Set on the response to a scored attempt: what it added to the plan. */
  planAdded: PlanAddition[]
  /** Set when this is course content the learner must complete again because of a flagged skill. */
  review: { skill: string; pct: number } | null
  /** A YouTube video: what to play and the share of it that must be watched to finish. */
  video: { videoId: string; startSeconds: number | null; minWatchedPct: number } | null
  /** An external course or page: its preview card, where to send the learner and what to do there. */
  link: {
    url: string
    host: string
    summary: string | null
    instructions: string | null
    imageUrl: string | null
  } | null
  /** A connected tool (LTI): which one and the tool-specific reference. */
  tool: {
    toolId: string
    name: string
    ref: string
    /** True while the learner may launch it again: always for an interview, until the attempts are used for an assessment. */
    retries: boolean
    /** Attempts an assessment allows; null means unlimited (an interview). */
    attemptsAllowed: number | null
    /** Minutes an assessment attempt may take; null means no limit. */
    timeLimitMinutes: number | null
    /** Score the learner must reach for the item to count as done; null means any scored attempt. */
    passScore: number | null
    /** True when the course can be finished without this item. */
    optional: boolean
  } | null
  status: ProgressStatus
  score: number | null
  attempts: number
  /** Set when the learner can still act on it. */
  locked: string | null
}

// ── Connected tools (#63) ───────────────────────────────────────────────────

/** A connected LTI tool as the registry shows it. */
export interface LearnTool {
  toolId: string
  /** The connection (registration with a vendor) it launches through. */
  connectionId: string
  name: string
  /** An interview is a practice lab that can be retried; an assessment is a graded question bank. */
  kind: 'interview' | 'assessment'
  retries: boolean
  /** Whether an item for it can be the course's pre or post assessment. */
  labelable: boolean
  enabled: boolean
  /** Agencies and providers that may use it; empty means every workspace. */
  workspaceIds: string[]
  /** What the course editor calls an item's reference for this tool, and how to find the value; null: generic. */
  referenceLabel: string | null
  referenceHelp: string | null
}

/** A registration with a tool vendor: the client id and URLs one or more tools launch through. */
export interface LearnConnection {
  id: string
  name: string
  clientId: string
  deploymentId: string
  loginUrl: string
  launchUrl: string
  jwksUrl: string
  /** How many tools use it. */
  toolCount: number
}

/** One change to a connection or tool: who made it, when, and each field's old and new value. */
export interface LearnRegistryChange {
  id: string
  subject: 'connection' | 'tool'
  subjectId: string
  subjectName: string
  action: 'created' | 'updated' | 'removed'
  /** The person's name or email when they made the change; "System" for first-start setup. */
  userName: string
  changes: Record<string, { from: unknown; to: unknown }>
  createdAt: string
}

export interface LearnToolList {
  tools: LearnTool[]
  /** Only for someone who may manage tools; empty for an author picking a tool. */
  connections: LearnConnection[]
  /** Whether the caller may add, change or remove tools. */
  canManage: boolean
}

// ── Public catalog (#49) ────────────────────────────────────────────────────

/** An offering in an agency's training catalog: a published course of a provider the agency lists. */
export interface CatalogCourse {
  id: string
  title: string
  summary: string | null
  sector: string | null
  credential: string | null
  lengthWeeks: number | null
  provider: string
  outcomes: string[]
  targetRoles: string[]
  /** Start date of the next cohort that has not begun, if any. */
  nextStart: string | null
  openCohorts: number
}

export interface CatalogOffering extends CatalogCourse {
  modules: { title: string; items: number }[]
  /** Cohorts a learner could still join. Join codes are never public. */
  cohorts: {
    name: string
    startsAt: string | null
    endsAt: string | null
    status: CohortStatus
    /** Seats left, or null when the cohort has no limit. */
    seatsLeft: number | null
  }[]
}

// ── Practice interview ──────────────────────────────────────────────────────

export interface InterviewAnswerResult {
  score: number
  feedback: string
}

export interface InterviewAttempt {
  score: number
  at: string
  answers: InterviewAnswerResult[]
}

export interface LearnerInterview {
  role: string
  questions: string[]
  maxAttempts: number
  /** Earlier attempts, newest last. Answers are not kept, only scores and feedback. */
  attempts: InterviewAttempt[]
}
