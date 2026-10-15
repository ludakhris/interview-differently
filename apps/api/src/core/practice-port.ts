import type { CheckpointHelpKind, CheckpointTable } from './checkpoint-types'

/**
 * What the Simulator does for an LMS checkpoint (GitHub issue #90). The learner works the checkpoint in the
 * Simulator's own page, embedded in the course by LTI; the LMS reads what they did through the simulator feed. This
 * port covers the rest: staff screens (the question bank's prompts, generated practice to review) and the demo
 * autoplay, which plays a scripted learner through the same Simulator code the page uses. The LMS depends on this
 * port and never on Simulator code (apps/api/src/simulator/checkpoints provides it). Answer keys never cross it.
 */

/** One learner's slot: the cohort, the learner, and the LMS item (the LTI resource link) the checkpoint fills. */
export interface LearnerSlot {
  cohortId: string
  userId: string
  itemId: string
}

/**
 * Where a checkpoint sits in a course, as the LMS sends it to the Simulator: the LTI custom parameter `checkpoint`
 * (JSON) on a launch, or the demo autoplay. The course decides what to ask; the bank holds the questions.
 */
export interface CheckpointPlacement {
  bankSlug: string
  /** The requests to ask, in order (question numbers in the bank). Empty for a practice slot. */
  refs: string[]
  title: string
  scenario: string | null
  /** Every request may be passed ("I have not learned this yet"). */
  diagnostic: boolean
  /**
   * A diagnostic's requests that test the same thing, in order (the course groups them by skill). After a miss or a
   * pass in a group, its remaining requests are no longer asked: that is a gap already, and more questions on it would
   * only tire the learner. Absent: every request is asked.
   */
  groups?: string[][]
  /**
   * A practice slot: the Simulator writes requests for `skill` (its label) aimed at what the learner missed on
   * `evidenceRefs`, holding new ones for staff review when `review` is set.
   */
  practice: { skill: string; evidenceRefs: string[]; review: boolean } | null
}

/** Tokens the Claude API reported for writing a library row, summed over its tries (null on rows that predate them). */
export interface ContentTokens {
  input: number | null
  output: number | null
  cacheRead: number | null
  cacheWrite: number | null
}

/**
 * Which library rows a system admin lists. 'needs-review': pending, or approved with no person's approval (shown to
 * learners, but not reused). 'approved': approved by a person, so reusable. Content is reused only when it is approved
 * and `reviewedBy` is set.
 */
export type LibraryFilter = 'needs-review' | 'approved' | 'rejected' | 'all'

/**
 * Generated practice as staff see it: library content and the learners it was used for (in one cohort on the board, in
 * every cohort for a system admin). `reviewedBy` is the person who approved or rejected it (course staff on the board,
 * or a system admin in Content review); null while no person has.
 */
export interface PracticeContentView {
  id: string
  bankSlug: string
  skill: string
  status: 'pending' | 'approved' | 'rejected'
  intro: string
  tasks: string[]
  model: string
  promptVersion: string
  tokens: ContentTokens
  createdAt: string
  reviewedAt: string | null
  reviewedBy: string | null
  usedBy: { userId: string; itemId: string; at: string }[]
}

export interface PracticePort {
  /** The bank's dataset tables and the named questions' prompts and senders (no answers), for staff screens. */
  bank(
    bankSlug: string,
    refs: string[]
  ): Promise<{
    schema: CheckpointTable[]
    tasks: { ref: string; prompt: string; from: string | null }[]
  }>
  /** Generated practice used in a cohort, newest first. */
  practiceInCohort(cohortId: string): Promise<PracticeContentView[]>
  /**
   * Staff of `cohortId` approve or send back practice their learners were given. Approving approves the library row.
   * Sending back marks this cohort's uses sent back (kept as history): those slots get new practice and the set is not
   * reused in this cohort. The library row itself is rejected only when no other cohort has a use not sent back, so
   * one cohort's decision never takes content from another's learners. The view lists only this cohort's live uses.
   */
  review(
    practiceSetId: string,
    approve: boolean,
    reviewerId: string,
    cohortId: string
  ): Promise<PracticeContentView>
  /**
   * The practice library for a system admin (the LMS checks the caller is one; it reads as every agency, so `usedBy`
   * lists uses in all cohorts). The newest LIBRARY_LIMIT rows, and `total`, how many match the filter.
   */
  library(filter: LibraryFilter): Promise<LibraryPage<PracticeContentView>>
  /**
   * A system admin's library decision. Approving sets 'approved' and the reviewer, which makes the row reusable for any
   * learner. Rejecting sets 'rejected' and the reviewer: it is no longer shown or reused, and learners who had it are
   * given new practice on their next visit.
   */
  curate(practiceSetId: string, approve: boolean, reviewerId: string): Promise<PracticeContentView>
  /** Demo autoplay: an answer or a pass, graded and recorded as if the learner sent it from the page. */
  demoAnswer(
    slot: LearnerSlot,
    placement: CheckpointPlacement,
    input: { ref: string; sql?: string; pass?: boolean }
  ): Promise<{ correct: boolean; done: boolean; scorePct: number | null }>
  /** Demo autoplay: help on a request, recorded as if the learner asked for it. */
  demoHelp(
    slot: LearnerSlot,
    placement: CheckpointPlacement,
    input: { ref: string; sql: string; kind: CheckpointHelpKind }
  ): Promise<void>
  /** Demo autoplay: the practice slot's requests, written (or reused) for the learner. */
  demoPractice(
    slot: LearnerSlot,
    placement: CheckpointPlacement
  ): Promise<{ status: 'pending' | 'ready' | 'rejected'; refs: string[] }>
  /**
   * Demo reset: forgets what these demo learners did in the cohort's checkpoints (their answers, help and practice
   * uses). The practice itself stays in the library.
   */
  demoForget(cohortId: string, userIds: string[]): Promise<void>
}

export const PRACTICE_PORT = Symbol('PRACTICE_PORT')

/**
 * The requests still asked, in order: all of them, less any unanswered request in a group (see
 * CheckpointPlacement.groups) after one of the group's requests was missed or passed. The Simulator asks these; the LMS
 * judges a checkpoint finished when each has a result. One rule, so both sides agree.
 */
export function stillAsked(
  refs: string[],
  groups: string[][] | undefined,
  results: Record<string, { correct: boolean } | undefined>
): string[] {
  if (!groups?.length) return refs
  const groupOf = new Map<string, number>()
  groups.forEach((g, i) => g.forEach((r) => groupOf.set(r, i)))
  const missed = new Set<number>()
  return refs.filter((ref) => {
    const g = groupOf.get(ref)
    const r = results[ref]
    if (g === undefined) return true
    if (missed.has(g)) return r !== undefined
    if (r && !r.correct) missed.add(g)
    return true
  })
}

export const LIBRARY_FILTERS: readonly LibraryFilter[] = [
  'needs-review',
  'approved',
  'rejected',
  'all',
]

/**
 * The rows a library filter lists, as a Prisma `where` that fits both PracticeSet and Lesson (same status and
 * reviewer columns). One rule, so the Simulator and Spark list the same thing for the same filter.
 */
export function libraryWhere(filter: LibraryFilter) {
  switch (filter) {
    case 'needs-review':
      return { OR: [{ status: 'pending' }, { status: 'approved', reviewedBy: null }] }
    case 'approved':
      return { status: 'approved', reviewedBy: { not: null } }
    case 'rejected':
      return { status: 'rejected' }
    case 'all':
      return {}
  }
}

/** At most this many library rows are listed at once, newest first. */
export const LIBRARY_LIMIT = 200

/** The newest LIBRARY_LIMIT library rows, and how many match the filter in all. */
export interface LibraryPage<T> {
  rows: T[]
  total: number
}
