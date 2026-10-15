import type { LearnerOutline, LearnerOutlineItem } from '@id/types'

/**
 * Where a learner picks up a course: the first item on their path, in the order the course page shows it (each
 * module's items, with anything their results added right after the item that added it, then any other additions),
 * that is not done and was not skipped. Null when nothing is left. `started` says whether they have begun at all.
 */
export function resumeItem(
  outline: Pick<LearnerOutline, 'modules' | 'added'>
): { item: LearnerOutlineItem; started: boolean } | null {
  const inOutline = new Set(outline.modules.flatMap((m) => m.items.map((i) => i.id)))
  const after = (id: string) => outline.added.filter((a) => a.reason.sourceItemId === id)
  const path: LearnerOutlineItem[] = [
    ...outline.modules.flatMap((m) => m.items.flatMap((i) => [i, ...after(i.id)])),
    ...outline.added.filter((a) => !a.reason.sourceItemId || !inOutline.has(a.reason.sourceItemId)),
  ]
  const item = path.find((i) => !i.skipped && i.status !== 'completed')
  if (!item) return null
  return { item, started: path.some((i) => !i.skipped && i.status !== 'not_started') }
}
