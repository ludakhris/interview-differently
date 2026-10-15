/**
 * How each product is doing, for the system admin's System status page in Learn Differently (GitHub issue #92). Each
 * product answers for itself through its own port (the Skill Simulator for grading, Spark for lessons); the LMS
 * gathers them through here and imports neither.
 */

/**
 * Failures learners hit through no fault of their own in the last `windowHours` hours: how many, how many in each
 * hour (`windowHours` counts, oldest first, the last ending now), and the newest (at most 20), newest first.
 */
export interface FailureSummary<K extends string = string> {
  windowHours: number
  count: number
  perHour: number[]
  latest: { at: string; reason: string; kind: K }[]
}

/** A product's learner failures: the last day's, and when the last one happened (kept 30 days; null when none). */
export interface FailureHistory<K extends string = string> {
  failures: FailureSummary<K>
  lastFailureAt: string | null
}

/** The grading self-test: a grading process loads the practice dataset and runs a query, as a learner's answer would. */
export interface GradingSelfTest {
  /** 'busy': every grading slot was taken by learners, so it could not check (not a failure). */
  status: 'ok' | 'failing' | 'busy'
  /** Why it failed; null when it did not. */
  reason: string | null
  /** The most memory the grading process held with the dataset loaded, in MB; null where it cannot be read. */
  peakMb: number | null
  limitMb: number
  checkedAt: string
}

/** 'infra': the grading process would not run; 'busy': every grading slot stayed busy. */
export type GradingFailureKind = 'infra' | 'busy'

/** The Skill Simulator's status. */
export interface SimulatorStatus {
  /** Learner SQL grading: the self-test's last answer while it is fresh (five minutes), and the failures. */
  grading: { selfTest: GradingSelfTest } & FailureHistory<GradingFailureKind>
}

/** 'not-configured': the AI service is not configured; 'no-lesson': no usable lesson after two tries. */
export type LessonFailureKind = 'not-configured' | 'no-lesson'

/** Spark's (Micro Learning's) status: its lessons play like videos in Spark's player. */
export interface SparkStatus {
  /** Whether lessons can be made and linked at all, from the server's configuration (no outside call). */
  setup: {
    status: 'ok' | 'failing'
    /** What is missing, in plain words; empty when set up. */
    problems: string[]
  }
  /** Whether the player's web address answers, checked at most once every five minutes. */
  player: {
    /** 'not-set-up': there is no player address to check. */
    status: 'ok' | 'failing' | 'not-set-up'
    reason: string | null
    checkedAt: string
  }
  /** Lessons made for a learner that could not be written. */
  lessons: FailureHistory<LessonFailureKind>
}

export interface StatusPort<T> {
  status(): Promise<T>
}

export const SIMULATOR_STATUS_PORT = Symbol('SIMULATOR_STATUS_PORT')
export const SPARK_STATUS_PORT = Symbol('SPARK_STATUS_PORT')
