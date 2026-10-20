// GENERATED COPY of packages/types/src/learn.ts. Do not edit here.
// Edit the original, then run: npm run sync:types --workspace @id/api
// (The API build has no access to packages/, so it carries its own copy.)

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
  hostId: string
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
  /** Marked as a demo with full sample data (attendance, talent, activity, notes), to find it among many. */
  featuredDemo: boolean
  /** The caller's highest role in it: 'system-admin', 'agency-admin', 'provider-admin', 'organization-admin', 'case-manager' or 'instructor'. */
  role: string
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
  /** #69: the learner fills in their talent profile (resume, education, experience, targets). */
  | 'profile'
  /** Adaptive checkpoints (#90): a slot for a short Spark lesson made for the learner's gap in a skill. */
  | 'spark_lesson'
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
  /**
   * Pieces of evidence needed before the skill counts as shown (default 1). A gap needs only one: help comes on
   * a sign, moving on needs proof.
   */
  minEvidence?: number
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
  /** Adaptive checkpoints (prototype): the course has a diagnostic that builds each learner's own path. */
  adaptive: boolean
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

/** #69: how a cohort meets. Live and hybrid cohorts have sessions and attendance; online ones log activity. */
export type CohortDelivery = 'online' | 'live' | 'hybrid'

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
  /** #68: entering the code creates a join request that staff approve, not an enrollment. */
  requiresApproval: boolean
  /** Who learners should ask while approval is on (plain text). Required when requiresApproval. */
  joinContact: string | null
  /** Join requests still waiting for a decision. They hold no seat and are not in `enrolled`. */
  pendingRequests: number
  /** How the cohort meets. */
  delivery: CohortDelivery
  /** #69: the learner's first course item is their profile, and it is required for completion. */
  requiresProfile: boolean
  /** Months before a saved profile counts as stale and must be refreshed (1-60). Null = never. */
  profileRefreshMonths: number | null
  /** The cohort's course is adaptive (see CourseSummary.adaptive). */
  adaptive: boolean
}

/** A pending join request as staff see it. */
export interface CohortJoinRequestRow {
  id: string
  userId: string
  name: string
  email: string | null
  requestedAt: string
  /** Answers given when the request came from the public catalog (#124); null for a join code. */
  intake: CatalogIntake | null
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
  /**
   * Counts of staff notes about the person and open follow-ups, for provider staff only (null
   * for everyone else, and on a person's own row). Counts only, never content.
   */
  noteSummary: { notes: number; openFollowUps: number } | null
}

/** Where one learner is on one assessment of a cohort's course. */
export type AssessmentLearnerStatus = 'not_started' | 'in_progress' | 'submitted'

/** How a cohort did on the post-assessment compared with the pre-assessment, for learners who have both scores. */
export interface AssessmentImprovement {
  /** Learners with both a pre and a post score. */
  learners: number
  averagePre: number
  averagePost: number
  /** Percentage points: averagePost minus averagePre. */
  change: number
}

/** One row of the cohort's Assessments grid: an assessment item of the course with its stats. */
export interface AssessmentSummaryRow {
  itemId: string
  title: string
  label: 'pre' | 'post' | null
  attemptsAllowed: number
  counts: { notStarted: number; inProgress: number; submitted: number }
  /** Average of the best scores learners have so far; null when nobody has one. */
  averageScore: number | null
  /** Set on the post-assessment row when any learner has both scores; null otherwise. */
  improvement: AssessmentImprovement | null
}

export interface AssessmentSummary {
  generatedAt: string
  items: AssessmentSummaryRow[]
}

export interface AssessmentResultLearner {
  enrollmentId: string
  userId: string
  name: string
  email: string | null
  status: AssessmentLearnerStatus
  submittedAt: string | null
  late: boolean
  /** Minutes from start to submit; null until submitted. */
  minutes: number | null
  /** Percent correct on the latest attempt; null until submitted. */
  overall: number | null
  /** Correct and total per section, in the order of AssessmentResults.sections. */
  sections: { sectionId: string; correct: number; total: number }[]
  /** On the post-assessment: this learner's pre and post scores and the change; null elsewhere or when either is missing. */
  pre: number | null
  post: number | null
  change: number | null
}

/** Every learner's result on one assessment of the cohort: the view behind the grid's View results and Download CSV. */
export interface AssessmentResults {
  itemId: string
  title: string
  label: 'pre' | 'post' | null
  sections: { id: string; title: string }[]
  /** The assessment's designed length; null when none was set. */
  expectedMinutes: number | null
  /** Median minutes taken by those who submitted; null until someone has. */
  medianMinutes: number | null
  improvement: AssessmentImprovement | null
  learners: AssessmentResultLearner[]
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

/** A join request the learner has made that is not yet approved (#68). */
export interface LearnerJoinRequest {
  id: string
  cohortId: string
  cohortName: string
  courseTitle: string
  institutionName: string
  status: 'pending' | 'declined'
  requestedAt: string
  /** Who to ask, as the staff wrote it. */
  contact: string | null
}

/** What POST /learn/me/join returns when the cohort needs approval; otherwise it returns the LearnerCohortCard. */
export interface LearnerJoinPending {
  pending: true
  request: LearnerJoinRequest
}

export interface LearnerOutlineItem {
  id: string
  type: string
  title: string
  label: string | null
  status: ProgressStatus
  score: number | null
  attempts: number
  /** Short wording for a state the status cannot say, e.g. a profile that needs a refresh. */
  note?: string | null
  /** The course skill the item teaches (config `teaches`), if any. */
  skill?: string | null
  /** Set when the learner was let past this item because they showed its skill: not required. */
  skipped?: { skill: string; pct: number; n: number; at: string } | null
  /** An adaptive checkpoint (a `tool` item run in the course page, GitHub issue #90). */
  checkpoint?: boolean
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

/** One counted score a connected tool sent back (#67). */
export interface ToolAttempt {
  score: number
  /** ISO time the score was recorded. */
  at: string
  /** The highest score of the log; the earliest when tied. */
  best: boolean
  /** Score reached the item's pass mark; null when the item has no pass mark. */
  passed: boolean | null
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
    /** True when the learner may open their answers: attempts used up and the item allows review. */
    reviewable: boolean
    /** Attempts an assessment allows; null means unlimited (an interview). */
    attemptsAllowed: number | null
    /** Minutes an assessment attempt may take; null means no limit. */
    timeLimitMinutes: number | null
    /** Score the learner must reach for the item to count as done; null means any scored attempt. */
    passScore: number | null
    /** True when the course can be finished without this item. */
    optional: boolean
    /** The tool runs inside the course page (an adaptive checkpoint, GitHub issue #90), not in its own window. */
    embedded: boolean
  } | null
  status: ProgressStatus
  score: number | null
  attempts: number
  /** A connected tool's counted scores, newest first (at most 50). Empty for other item types. */
  attemptLog: ToolAttempt[]
  /** Attempts counted before the log existed, so `attempts` still adds up: max(0, attempts - log length). */
  attemptsBeforeLog: number
  /** Set when the learner can still act on it. */
  locked: string | null
  /** Short wording for a state the status cannot say, e.g. a profile that needs a refresh. */
  note?: string | null
}

// ── Connected tools (#63) ───────────────────────────────────────────────────

/** A connected LTI tool as the registry shows it. */
export interface LearnTool {
  toolId: string
  /** The connection (registration with a vendor) it launches through. */
  connectionId: string
  name: string
  /** An interview is a practice lab that can be retried; an assessment is a graded question bank. */
  kind: 'interview' | 'assessment' | 'checkpoint'
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
  /** True in a test environment for Interview Differently's own tool: its saved addresses are ignored. */
  urlsFromEnvironment: boolean
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
  /** The addresses a registering tool uses, as this platform serves them (for the how-it-works text). */
  registration?: { configurationUrl: string; registrationUrl: string }
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
  /** #124: shown so a prospective learner can compare programs. Null when the course does not say. */
  tuitionDollars: number | null
  contactHours: number | null
  format: string | null
  prerequisite: string | null
  /** True when a signed-in learner can request a seat here without a join code. */
  acceptsRequests: boolean
}

/** How a learner plans to pay, asked when requesting from the catalog. */
export type CatalogFunding = 'wioa' | 'dvr' | 'employer' | 'self' | 'unsure'

/** The short intake a learner fills in when requesting a program from the catalog (#124). */
export interface CatalogIntake {
  phone: string
  education: string
  employment: 'employed' | 'not-employed'
  /** Employer and job title, when employed. */
  employer: string | null
  funding: CatalogFunding
  language: string | null
  reason: string | null
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

// ── Adaptive checkpoints (GitHub issue #90) ─────────────────────────────────
//
// The LMS places checkpoints and lessons and changes the plan; the Simulator runs the checkpoint (embedded by LTI,
// see checkpoint.ts) and Spark plays the lesson (see lesson.ts).

/**
 * `config` of a checkpoint (a `tool` item whose tool is a checkpoint): { toolId, ref: question bank slug,
 * tasks: [{ ref, skill }], scenario?, diagnostic?, teaches? }, where `ref` is a question number in the bank. A
 * targeted-practice slot is { toolId, ref, generated: { skill }, remediationFor: skill }: the Simulator writes its
 * requests for each learner.
 */
export interface CheckpointTaskConfig {
  ref: string
  skill: string
}

export type IntakeLevel = 'never' | 'some' | 'regular'

/** What a checkpoint's answers changed in the learner's plan, after the LMS read them (POST .../adaptive/sync). */
export interface AdaptiveSyncResult {
  completed: boolean
  /** The cursor to send as `since` next time (the server's clock). */
  at: string
  planAdded: PlanAddition[]
  planSkipped: { itemId: string; title: string; skill: string }[]
}

/** A Spark lesson slot for one learner (GET or POST .../lesson): the player link once the lesson is ready. */
export interface LessonSlot {
  /** 'none': not made yet (POST makes it); 'pending': waiting for staff review. */
  status: 'none' | 'pending' | 'ready' | 'rejected'
  skillLabel: string
  title: string | null
  /** The Spark player to embed, signed for this learner. Null until ready. */
  url: string | null
  completed: boolean
}

export type SkillState = 'gap' | 'demonstrated' | 'emerging' | 'unknown'

export interface BoardSkill {
  id: string
  label: string
  targetPct: number
  minEvidence: number
}

export interface BoardLearnerSkill {
  skillId: string
  pct: number | null
  n: number
  status: SkillState
}

/** One item on a learner's path, as the board draws it. */
export interface BoardPathItem {
  itemId: string
  moduleTitle: string
  title: string
  type: string
  /** Expected minutes, for time to job-ready. */
  minutes: number
  skill: string | null
  state: 'todo' | 'done' | 'skipped' | 'added' | 'added_done' | 'review'
  reason: string | null
  at: string | null
  /** For an item skipped or added: the evidence behind it and where it came from (for example the diagnostic). */
  evidence: { pct: number | null; n: number; source: string | null } | null
}

export interface BoardLearner {
  enrollmentId: string
  userId: string
  name: string
  intake: IntakeLevel | null
  skills: BoardLearnerSkill[]
  path: BoardPathItem[]
  needsHelp: string[]
  ready: boolean
  itemsDone: number
  itemsTotal: number
  /** Expected minutes of required work still to do, of all required work, and of work skipped as shown. */
  minutesLeft: number
  minutesTotal: number
  minutesSaved: number
  /** For the demo cohort: the persona whose script can be played, and the next step's description. */
  demo: { persona: string; next: string | null } | null
}

export interface BoardPractice {
  id: string
  /** Practice requests, or a lesson made for the learner (a narrated storyboard). */
  kind: 'practice' | 'lesson'
  learnerName: string
  skillLabel: string
  status: 'pending' | 'approved' | 'rejected'
  /** A person approved it (course staff here, or a system admin), so the library may reuse it. */
  reviewed: boolean
  intro: string
  tasks: string[]
  model: string
  createdAt: string
}

/**
 * Which AI-written library rows the system admin's Content review lists (GitHub issue #90). 'needs-review': waiting
 * for review, or shown to learners without a library approval. 'approved': approved for reuse.
 */
export type ContentReviewFilter = 'needs-review' | 'approved' | 'rejected' | 'all'

/** One AI-written library row (Simulator practice or a Spark lesson), for the system admin's Content review. */
export interface LibraryContent {
  id: string
  kind: 'practice' | 'lesson'
  skillLabel: string
  status: 'pending' | 'approved' | 'rejected'
  /** A person approved it for the library, so it is reused for other learners. */
  reusable: boolean
  /** The practice intro, or the lesson title. */
  title: string
  /** Practice: the question bank it was written from. */
  bankSlug: string | null
  /** Lesson: the experience level it was written for, when it shaped the lesson. */
  level: string | null
  /** The practice requests (no heading), or the lesson's scenes. */
  parts: { heading: string | null; text: string }[]
  model: string
  promptVersion: string
  /** Tokens the Claude API reported for writing it (null on older rows). */
  tokens: {
    input: number | null
    output: number | null
    cacheRead: number | null
    cacheWrite: number | null
  }
  createdAt: string
  reviewedAt: string | null
  /** Who made the last library decision (a name when known), or null. */
  reviewedBy: string | null
  /** Times it was given to a learner, in every cohort. */
  uses: number
  learners: number
}

export interface ContentLibrary {
  practice: LibraryContent[]
  lessons: LibraryContent[]
  /** Rows matching the filter, before the cap on how many are listed (the newest 200). */
  total: { practice: number; lessons: number }
}

/**
 * Failures learners hit through no fault of their own in the last `windowHours` hours (newest 20 listed), and the last
 * one kept (30 days; null when none).
 */
export interface StatusFailures<K extends string> {
  failures: {
    windowHours: number
    count: number
    /** Failures in each hour of the window, `windowHours` counts, oldest first (the last hour ends now). */
    perHour: number[]
    latest: { at: string; reason: string; kind: K }[]
  }
  lastFailureAt: string | null
}

/** Admin toolbox: System status (GitHub issue #92), how each product is doing. */
export interface SystemStatus {
  /** Skill Simulator. */
  simulator: {
    /** Learner SQL grading. */
    grading: {
      /** The grading self-test, reused for five minutes. 'busy': every grading slot was taken, so it could not check. */
      selfTest: {
        status: 'ok' | 'failing' | 'busy'
        reason: string | null
        /** Memory a grading process held with the practice dataset loaded, in MB; null where it cannot be read. */
        peakMb: number | null
        limitMb: number
        checkedAt: string
      }
    } & StatusFailures<'infra' | 'busy'>
  }
  /** Micro Learning (Spark): lessons made for a learner, which play like videos in Spark's player. */
  spark: {
    /** The server's configuration: the AI service and, in production, the link secret and the player's address. */
    setup: { status: 'ok' | 'failing'; problems: string[] }
    /** Whether the player's web address answers, reused for five minutes. 'not-set-up': there is no address. */
    player: { status: 'ok' | 'failing' | 'not-set-up'; reason: string | null; checkedAt: string }
    /** Lessons made for a learner that could not be written. */
    lessons: StatusFailures<'not-configured' | 'no-lesson'>
  }
}

export interface AdaptiveBoard {
  cohortId: string
  courseTitle: string
  skills: BoardSkill[]
  settings: { testOut: boolean; approveGenerated: boolean; canEdit: boolean }
  learners: BoardLearner[]
  practice: BoardPractice[]
  /** The job the course prepares for (its first target role), the goal the board measures against. */
  jobTitle: string | null
  /** Plan A: the course as written, the path every learner starts with, in order. */
  outline: { itemId: string; title: string; moduleTitle: string; type: string; minutes: number }[]
}

export type LessonVisual =
  | { kind: 'title'; sub: string }
  | { kind: 'sql'; code: string; highlight: string[] }
  | { kind: 'table'; columns: string[]; rows: string[][]; highlightRows: number[] }
  | { kind: 'compare'; leftLabel: string; left: string; rightLabel: string; right: string }
  | { kind: 'bullets'; items: string[] }

/** One thing a learner saw, in order, for staff to replay their view (adaptive checkpoints prototype). */
export type SeenEntry =
  | {
      kind: 'request'
      at: string
      item: string
      from: string | null
      prompt: string
      /** Their answer; null when they passed. */
      sql: string | null
      correct: boolean
      passed: boolean
      reason: string | null
    }
  | {
      kind: 'help'
      at: string
      item: string
      helpKind: 'hint' | 'explain' | 'example'
      text: string
      exampleSql: string | null
    }
  | {
      kind: 'video'
      at: string
      item: string
      /** Plays in Spark's player through the seen view's watch link (it records nothing). */
      lessonId: string
      title: string
      scenes: { heading: string; narration: string; visual: LessonVisual }[]
      /** How far they watched, for example "all 6 scenes · Mac voice"; null when not opened. */
      watched: string | null
    }
  | { kind: 'practice'; at: string; item: string; intro: string; tasks: string[] }

export interface LearnerSeen {
  name: string
  entries: SeenEntry[]
}

/** Admin -> Compliance: where we stand on one requirement a governing agency places on vendors. */
export type ComplianceStatus = 'satisfied' | 'partial' | 'not_satisfied' | 'not_applicable'

export interface ComplianceRequirement {
  /** The agency's own id, e.g. IAM-12. */
  code: string
  area: string
  requirement: string
  strength: 'MUST' | 'SHOULD'
  source: string
  status: ComplianceStatus
  /** Where we stand today; for a requirement that does not apply, why not. */
  standing: string
  /** How we get there; partly and not satisfied requirements only. */
  plan: string | null
  /** The GitHub issue (in this repo) that tracks the work; partly and not satisfied requirements only. */
  issue: number | null
}

/** One governing agency's requirements, e.g. Delaware DTI. */
export interface ComplianceFramework {
  key: string
  name: string
  importedAt: string
  requirements: ComplianceRequirement[]
}

/** The file an admin imports: one framework, replacing what was there. */
export interface ComplianceImport {
  key: string
  name: string
  requirements: ComplianceRequirement[]
}
