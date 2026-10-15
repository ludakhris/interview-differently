import type { LessonScene } from './lesson-types'
import type { ContentTokens, LearnerSlot, LibraryFilter, LibraryPage } from './practice-port'

/**
 * What Micro Learning (Spark) does for the LMS (GitHub issue #90): a short lesson aimed at one learner's gap, a
 * storyboard that Spark's player (apps/spark) plays as a narrated video, embedded in the course with a signed link.
 * Lessons are library content: a person-approved lesson is reused before a new one is written. Spark records how the
 * learner watched; the LMS reads that here and completes the item by its own rule. The LMS reaches Spark only through
 * this port (apps/api/src/spark provides it).
 */

export interface LessonRequest {
  slot: LearnerSlot
  /** The skill's label, as the course names it. */
  skill: string
  /** What the learner said about their experience, if anything. */
  level: string | null
  /** What the learner got wrong on this skill, so a new lesson aims at it. */
  misses: { prompt: string; sql: string; reason: string | null }[]
  /** The tables the course uses, as a short schema, so examples look like the learner's work. */
  tables: string
  /** Hold a newly written lesson for staff review. */
  review: boolean
}

export interface LessonSlotState {
  /** 'none': no lesson for this slot yet (or its lesson was sent back); 'pending': waiting for staff review. */
  status: 'none' | 'pending' | 'ready' | 'rejected'
  lessonId: string | null
  /** The lesson's title, once it is 'ready'. */
  title: string | null
  /** The player link, signed for this learner and slot, once the lesson can be shown. */
  url: string | null
  /** The learner played it to the end at least once. */
  finished: boolean
}

/**
 * A lesson as staff see it: library content and the learners it was used for (in one cohort on the board, in every
 * cohort for a system admin). `reviewedBy` as on PracticeContentView.
 */
export interface LessonContentView {
  id: string
  skill: string
  /** What the learner said about their experience, when it shaped the lesson. */
  level: string | null
  status: 'pending' | 'approved' | 'rejected'
  title: string
  scenes: LessonScene[]
  model: string
  promptVersion: string
  tokens: ContentTokens
  createdAt: string
  reviewedAt: string | null
  reviewedBy: string | null
  usedBy: { userId: string; itemId: string; at: string }[]
}

/** One lesson a learner was given, and how they watched it, for staff to replay their view. */
export interface LessonHistoryEntry {
  at: string
  itemId: string
  title: string
  scenes: LessonScene[]
  /** For example "all 6 scenes · Mac voice"; null when never opened. */
  watched: string | null
}

export interface SparkPort {
  lessonSlot(slot: LearnerSlot): Promise<LessonSlotState>
  /** The title of the slot's lesson once it can be shown (approved, not sent back); null otherwise. Signs no link. */
  lessonTitle(slot: LearnerSlot): Promise<string | null>
  /** Gives the slot a lesson: an approved one from the library when it fits, otherwise a new one. */
  makeLesson(request: LessonRequest): Promise<LessonSlotState>
  lessonsInCohort(cohortId: string): Promise<LessonContentView[]>
  lessonHistory(cohortId: string, userId: string): Promise<LessonHistoryEntry[]>
  /**
   * As PracticePort.review: a send-back marks this cohort's uses sent back (their watch history is kept) and only
   * reaches beyond this cohort when no other cohort has a use not sent back.
   */
  reviewLesson(
    lessonId: string,
    approve: boolean,
    reviewerId: string,
    cohortId: string
  ): Promise<LessonContentView>
  /** As PracticePort.library: the lesson library for a system admin, newest first, with uses in every cohort. */
  lessonLibrary(filter: LibraryFilter): Promise<LibraryPage<LessonContentView>>
  /** As PracticePort.curate: a system admin approves a lesson for reuse, or rejects it everywhere. */
  curateLesson(lessonId: string, approve: boolean, reviewerId: string): Promise<LessonContentView>
  /**
   * A link for a reviewer to watch the lesson in Spark's player before deciding, whatever its status. It plays the
   * same lesson and records nothing (no watch history, no effect on any learner). The caller checks the reviewer may
   * see the lesson; the link expires after an hour.
   */
  previewLink(lessonId: string, viewerId: string): Promise<string>
  /** Demo autoplay: plays the slot's lesson start to finish, as the player would record it. */
  demoWatch(slot: LearnerSlot): Promise<void>
  /** Demo reset: forgets these demo learners' lessons in the cohort and how they watched. Lessons stay in the library. */
  demoForget(cohortId: string, userIds: string[]): Promise<void>
}

export const SPARK_PORT = Symbol('SPARK_PORT')
