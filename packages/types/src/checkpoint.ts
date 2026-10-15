// The chat checkpoint (GitHub issue #90): the contract between the Simulator's API and its page in apps/web, which the
// LMS embeds in a course item by LTI and standalone Interview Differently opens as a work simulation. Answer keys never
// appear here.

/** A table of the checkpoint's dataset, for the schema rail and editor autocomplete. */
export interface CheckpointTable {
  table: string
  columns: { name: string; type: string }[]
  rowCount: number
}

/** One request in the chat. */
export interface CheckpointTask {
  ref: string
  prompt: string
  /** Who sends it ("Priya, Marketing"), from the question bank. Null: shown as a plain request. */
  from: string | null
  starterSql: string | null
  /** The shape of the right result (column names and row count): never its values. */
  expected: { columns: string[]; rowCount: number } | null
}

/** A result set cut down for the screen. */
export interface CheckpointPreview {
  columns: string[]
  rows: unknown[][]
  rowCount: number
}

/** The learner's latest answer to one request. */
export interface CheckpointAnswerState {
  correct: boolean
  /** They said they had not learned this yet. */
  passed: boolean
  sql: string | null
  /** The rows the sent query returned (at most 10), shown as the learner's reply. Null for a pass or a query that failed. */
  preview: CheckpointPreview | null
  reason: string | null
  error: string | null
  tries: number
  helps: number
}

/** The generated practice filling a practice slot, when the checkpoint is one. */
export interface CheckpointPractice {
  /** 'writing': not made yet (POST practice makes it); 'pending': written, waiting for staff review. */
  status: 'writing' | 'pending' | 'ready' | 'rejected'
  skill: string
  intro: string | null
}

export interface CheckpointView {
  deliveryId: string
  title: string
  /** The scene the chat opens with (for example "Your first morning on the data team"). */
  scenario: string | null
  /** A diagnostic: every request may be passed ("I have not learned this yet"). */
  diagnostic: boolean
  /**
   * Each request takes exactly one answer (a diagnostic, or a standalone work simulation): once sent, the chat moves
   * on to the next request, with no trying again.
   */
  oneAnswer: boolean
  schema: CheckpointTable[]
  tasks: CheckpointTask[]
  answers: Record<string, CheckpointAnswerState>
  practice: CheckpointPractice | null
  /** Every request has an answer or a pass; the score has gone back to the course. */
  done: boolean
  scorePct: number | null
}

/** A dry run: the learner's rows and, against a request, which of them are right (without revealing the answer). */
export interface CheckpointRun {
  preview: CheckpointPreview | null
  error: string | null
  check: {
    correct: boolean
    reason: string | null
    rowHits: boolean[]
    expected: { columns: string[]; rowCount: number }
  } | null
}

export interface CheckpointAnswerInput {
  ref: string
  sql?: string
  /** "I have not learned this yet" (diagnostic only). */
  pass?: boolean
}

export interface CheckpointAnswerResult {
  correct: boolean
  reason: string | null
  error: string | null
  preview: CheckpointPreview | null
  view: CheckpointView
}

export type CheckpointHelpKind = 'hint' | 'explain' | 'example'

export interface CheckpointHelp {
  kind: CheckpointHelpKind
  text: string
  /** A worked example on a different question (never the answer), for 'example'. */
  exampleSql: string | null
  /** The model that wrote it, or 'rules' when a fixed hint was used. */
  source: string
}

/** A work simulation a signed-in learner can open in standalone Interview Differently: a question bank's chat. */
export interface CheckpointSimulation {
  bankSlug: string
  title: string
  /** How many requests it has, and how many the learner has answered. */
  requests: number
  answered: number
  done: boolean
  scorePct: number | null
  /**
   * The learner's competency profile rows from it: per skill (the bank's `> competency:` name, else the section
   * title), the share of their answered requests that were right. Only skills with an answer appear.
   */
  competencies: { name: string; score: number }[]
}

/** Opening a work simulation: the delivery its chat runs on (`/me/checkpoints/:deliveryId`). */
export interface CheckpointStart {
  deliveryId: string
}

/**
 * Messages the embedded page posts to the LMS page around it (window.parent). They only nudge: the LMS reads the
 * evidence itself, through the Simulator feed.
 */
export type CheckpointFrameMessage =
  | { subject: 'id.checkpoint.answered'; ref: string; done: boolean }
  | { subject: 'id.checkpoint.resize'; height: number }
