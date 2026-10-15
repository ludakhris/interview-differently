// A Spark lesson (GitHub issue #90): the contract between Spark's API and its player in apps/spark, which the LMS
// embeds in a course item with a signed link.

/** What a scene shows. Small on purpose: a lesson is 60 to 90 seconds. */
export type SceneVisual =
  | { kind: 'title'; sub: string }
  | { kind: 'sql'; code: string; highlight: string[] }
  | { kind: 'table'; columns: string[]; rows: string[][]; highlightRows: number[] }
  | { kind: 'compare'; leftLabel: string; left: string; rightLabel: string; right: string }
  | { kind: 'bullets'; items: string[] }

export interface LessonScene {
  heading: string
  /** What the narrator says over the scene. */
  narration: string
  visual: SceneVisual
}

export interface LessonPlayerView {
  title: string
  scenes: LessonScene[]
  /** The server can read the narration aloud (GET audio/:scene); otherwise the browser's voice is used. */
  voice: boolean
  /** The learner has finished it before. */
  finished: boolean
  /** A reviewer's preview link: the player says so, and nothing it sends is recorded. */
  preview?: boolean
}

export type LessonEventKind = 'start' | 'scene' | 'replay' | 'finish'

export interface LessonEventInput {
  event: LessonEventKind
  scene?: number
  /** Which voice played the narration ('server' or 'browser'). */
  voice?: 'server' | 'browser'
}

/** Messages the embedded player posts to the LMS page around it (window.parent). */
export type LessonFrameMessage =
  | { subject: 'spark.lesson.finished' }
  | { subject: 'spark.lesson.resize'; height: number }
