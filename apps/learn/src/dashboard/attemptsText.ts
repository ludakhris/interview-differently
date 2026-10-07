/** One recorded attempt at a connected-tool item, as the API returns it (newest first). */
export interface AttemptLogEntry {
  score: number
  at: string
  best: boolean
  /** null when the item has no pass mark. */
  passed: boolean | null
}

/** More than this many attempts start collapsed behind a "Show all" button. */
export const COLLAPSED_COUNT = 5

/** "Oct 7, 2026, 3:42 PM" in the viewer's own timezone. */
export const attemptWhen = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Plain wording for the pass mark, or null when the item has none. */
export const passedText = (passed: boolean | null): string | null =>
  passed === null ? null : passed ? 'Passed' : 'Below the pass mark'

/** The calm note for attempts made before the log existed, or null when there are none. */
export const earlierNote = (
  before: number,
  viewer: 'learner' | 'staff' = 'learner'
): string | null => {
  if (!(before > 0)) return null
  const n = `${before} earlier ${before === 1 ? 'attempt was' : 'attempts were'}`
  return viewer === 'learner'
    ? `${n} not recorded, only your best score was kept.`
    : `${n} not recorded, only the best score was kept.`
}

/** Whether there is anything to show at all. */
export const hasAttemptInfo = (log: AttemptLogEntry[] | undefined, before: number | undefined) =>
  (log?.length ?? 0) > 0 || (before ?? 0) > 0

/** The entries to show: all of them, or the first few while collapsed. */
export const visibleAttempts = (log: AttemptLogEntry[], showAll: boolean): AttemptLogEntry[] =>
  showAll || log.length <= COLLAPSED_COUNT ? log : log.slice(0, COLLAPSED_COUNT)
