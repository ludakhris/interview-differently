// GENERATED COPY of packages/types/src/attention.ts. Do not edit here.
// Edit the original, then run: npm run sync:types --workspace @id/api
// (The API build has no access to packages/, so it carries its own copy.)

// #74: the "needs your attention" alert in the signed-in header.
// GET /learn/me/attention (any signed-in LearnDifferently account; only ever what the caller may act on).
// Counts and workspace or cohort names only: the alert shows on every page, so never a note, a
// support item title or a participant's name.

export type AttentionKind = 'join_requests' | 'support_followups' | 'platforms' | 'profile'

export interface AttentionItem {
  kind: AttentionKind
  title: string
  detail?: string
  count?: number
  /** An app path, with ?site= when the page needs a workspace. */
  href: string
}

export interface AttentionSummary {
  items: AttentionItem[]
  /** What the bell shows: the sum of the items' counts (an item without a count counts as 1). */
  total: number
}
