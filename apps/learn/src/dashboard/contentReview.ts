import type { ContentLibrary, ContentReviewFilter, IntakeLevel, LibraryContent } from '@id/types'

/** The Content review tabs, in order (GitHub issue #90). */
export const CONTENT_FILTERS: { value: ContentReviewFilter; label: string }[] = [
  { value: 'needs-review', label: 'Needs review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]

/** Practice and lessons in one list, newest first. */
export function contentList(lib: ContentLibrary): LibraryContent[] {
  return [...lib.practice, ...lib.lessons].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** When the API listed only the newest of each kind: for example "Showing the newest 200 of 340 practice." Else null. */
export function capText(lib: ContentLibrary): string | null {
  const parts = [
    lib.total.practice > lib.practice.length
      ? `the newest ${lib.practice.length} of ${lib.total.practice} practice`
      : null,
    lib.total.lessons > lib.lessons.length
      ? `the newest ${lib.lessons.length} of ${lib.total.lessons} lessons`
      : null,
  ].filter((p): p is string => p !== null)
  return parts.length ? `Showing ${parts.join(' and ')}.` : null
}

/** Where a row stands, in plain words. */
export function statusText(c: LibraryContent): string {
  if (c.status === 'rejected') return 'Rejected'
  if (c.status === 'pending') return 'Waiting for review'
  return c.reusable ? 'Approved for reuse' : 'Shown to learners, not yet approved'
}

/** For example "1,200 in · 340 out · 900 cached"; null when the row has no counts. */
export function tokenText(t: LibraryContent['tokens']): string | null {
  const n = (v: number) => v.toLocaleString('en-US')
  const cached = (t.cacheRead ?? 0) + (t.cacheWrite ?? 0)
  const parts = [
    t.input !== null ? `${n(t.input)} in` : null,
    t.output !== null ? `${n(t.output)} out` : null,
    cached > 0 ? `${n(cached)} cached` : null,
  ].filter((p): p is string => p !== null)
  return parts.length ? parts.join(' · ') : null
}

/** For example "Used by 2 learners", or "Not used yet". */
export function usedByText(c: Pick<LibraryContent, 'learners'>): string {
  if (c.learners === 0) return 'Not used yet'
  return `Used by ${c.learners} learner${c.learners === 1 ? '' : 's'}`
}

/** Which decisions make sense for a row: approving one already approved for reuse, or rejecting a rejected one, does nothing. */
export const canApprove = (c: LibraryContent): boolean => !c.reusable
export const canReject = (c: LibraryContent): boolean => c.status !== 'rejected'

/** Who a lesson was written for, in the words of the intake question ("how much SQL have you written?"). */
const LEVEL_TEXT: Record<IntakeLevel, string> = {
  never: 'For learners who have never written SQL',
  some: 'For learners who have written a little SQL',
  regular: 'For learners who use SQL regularly',
}

/** A lesson's level in plain words; null when the learner did not say. */
export function levelText(level: string | null): string | null {
  if (!level) return null
  return Object.prototype.hasOwnProperty.call(LEVEL_TEXT, level)
    ? LEVEL_TEXT[level as IntakeLevel]
    : `For learners who said “${level}”`
}
