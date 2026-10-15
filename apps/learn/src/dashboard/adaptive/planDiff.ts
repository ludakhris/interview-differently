import type { LearnerOutline } from '@id/types'

/**
 * Adaptive checkpoints (prototype): what changed in a learner's path between two looks at it, so the screen
 * can animate exactly those rows. A snapshot maps each item to its state on the path.
 */
export type PathState = string
export type PathSnapshot = Record<string, PathState>

export interface PathDiff {
  /** Items newly on the path (added for a gap). */
  entered: Set<string>
  /** Items newly skipped (the learner showed the skill). */
  skipped: Set<string>
  /** Items whose state changed in any other way (for example to done). */
  changed: Set<string>
}

export function diffPaths(before: PathSnapshot | null, after: PathSnapshot): PathDiff {
  const out: PathDiff = { entered: new Set(), skipped: new Set(), changed: new Set() }
  if (!before) return out
  for (const [id, state] of Object.entries(after)) {
    const was = before[id]
    if (was === state) continue
    if (state === 'skipped') out.skipped.add(id)
    else if (was === undefined) out.entered.add(id)
    else out.changed.add(id)
  }
  return out
}

/** The learner's own path as a snapshot: outline items (skipped or not) and what their results added. */
export function outlineSnapshot(o: LearnerOutline): PathSnapshot {
  const snap: PathSnapshot = {}
  for (const m of o.modules) for (const i of m.items) snap[i.id] = i.skipped ? 'skipped' : i.status
  for (const a of o.added) snap[`added:${a.id}`] = a.skipped ? 'skipped' : a.status
  return snap
}

/** The last path this browser showed, so a returning learner sees what changed since. */
export function loadSnapshot(key: string): PathSnapshot | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as PathSnapshot) : null
  } catch {
    return null
  }
}

export function saveSnapshot(key: string, snap: PathSnapshot): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(snap))
  } catch {
    /* private mode: the page still works, it just cannot show what changed */
  }
}
