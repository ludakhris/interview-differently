import type { SupportCategory, SupportStatus } from '@id/types'

export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
}
export const SUPPORT_STATUSES: SupportStatus[] = ['open', 'in_progress', 'resolved', 'cancelled']

export const SUPPORT_CATEGORY_LABEL: Record<SupportCategory, string> = {
  transportation: 'Transportation',
  childcare: 'Childcare',
  housing: 'Housing',
  technology: 'Technology',
  financial: 'Financial',
  health: 'Health',
  other: 'Other',
}
export const SUPPORT_CATEGORIES = Object.keys(SUPPORT_CATEGORY_LABEL) as SupportCategory[]

export type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'none'

/** Today as YYYY-MM-DD in the viewer's timezone (due dates are calendar days). */
export function todayKey(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** Finished items are never flagged. "soon" is within the next three days. */
export function dueState(
  dueDate: string | null,
  status: SupportStatus,
  today: string = todayKey()
): DueState {
  if (!dueDate) return 'none'
  if (status === 'resolved' || status === 'cancelled') return 'none'
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  const days = (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
  return days <= 3 ? 'soon' : 'later'
}

export const DUE_LABEL: Record<DueState, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  soon: 'Due soon',
  later: '',
  none: '',
}

/** Items still to do come first (by due date, undated last), finished ones after. */
export function sortItems<T extends { status: SupportStatus; dueDate: string | null }>(
  items: T[]
): T[] {
  const done = (s: SupportStatus) => s === 'resolved' || s === 'cancelled'
  return [...items].sort((a, b) => {
    if (done(a.status) !== done(b.status)) return done(a.status) ? 1 : -1
    if (a.dueDate === b.dueDate) return 0
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate < b.dueDate ? -1 : 1
  })
}

export const isDone = (s: SupportStatus): boolean => s === 'resolved' || s === 'cancelled'

/** Whole days a due date is behind today (both YYYY-MM-DD); 0 when it is not behind. */
export function daysOverdue(dueDate: string, today: string = todayKey()): number {
  const d = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86400000
  return d > 0 ? Math.round(d) : 0
}

/** "Oct 14", with the year only when it is not this year. */
export function dueShort(dueDate: string, today: string = todayKey()): string {
  const sameYear = dueDate.slice(0, 4) === today.slice(0, 4)
  return new Date(`${dueDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  })
}

/** To-do items (earliest due first, overdue on top, undated last) and finished ones (newest first). */
export function splitItems<
  T extends {
    status: SupportStatus
    dueDate: string | null
    resolvedAt: string | null
    updatedAt: string
  },
>(items: T[]): { active: T[]; done: T[] } {
  const sorted = sortItems(items)
  return {
    active: sorted.filter((i) => !isDone(i.status)),
    done: sorted
      .filter((i) => isDone(i.status))
      .sort((a, b) => (b.resolvedAt ?? b.updatedAt).localeCompare(a.resolvedAt ?? a.updatedAt)),
  }
}
