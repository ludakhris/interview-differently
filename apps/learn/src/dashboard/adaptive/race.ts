import type { BoardPathItem } from '@id/types'

/*
 * Time to job-ready (adaptive checkpoints prototype): a learner's path as runs in order, for the bar on the board.
 * Done and still-to-do runs are drawn to scale; what the evidence let the learner skip is a short green jump, so a
 * bar's length is the time the learner actually spends.
 */

/** Width of one skip on the bar, in pixels: a jump, not time. */
export const JUMP_PX = 66
/** How much one skip lengthens the bar; the rest of its width comes out of the done and to-do runs. */
export const JUMP_ADDS_PX = 22

export type RunKind = 'done' | 'proved' | 'left'
export interface Run {
  kind: RunKind
  minutes: number
}

/**
 * A path as runs in order: what is done, what the evidence let the learner skip (only items of the course as
 * written; help no longer needed was never in it), and what is still to do. Neighbours of a kind merge.
 */
export function raceRuns(path: BoardPathItem[], inA: Set<string>): Run[] {
  const runs: Run[] = []
  for (const p of path) {
    const kind: RunKind | null =
      p.state === 'skipped'
        ? inA.has(p.itemId)
          ? 'proved'
          : null
        : p.state === 'done' || p.state === 'added_done'
          ? 'done'
          : 'left'
    if (!kind || p.minutes <= 0) continue
    const last = runs[runs.length - 1]
    if (last?.kind === kind) last.minutes += p.minutes
    else runs.push({ kind, minutes: p.minutes })
  }
  return runs
}
