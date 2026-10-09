import type {
  AssessmentMonitorDelivery,
  AssessmentMonitorStudent,
  CohortAssessmentMonitor,
  MonitorStatus,
} from '@id/types'

/** Seconds between automatic refreshes the staff member can pick. */
export const AUTO_REFRESH_SECONDS = [5, 10, 30, 60] as const
export const AUTO_REFRESH_DEFAULT = 30

export const STATUS_WORDS: Record<MonitorStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
}

export type SortKey = 'name' | 'status' | 'progress' | 'saved'
export type SortDir = 'asc' | 'desc'

// Active first (that is what a monitor is for), then finished, then not started.
const STATUS_RANK: Record<MonitorStatus, number> = { in_progress: 0, submitted: 1, not_started: 2 }

const byName = (a: AssessmentMonitorStudent, b: AssessmentMonitorStudent) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

/** The students ordered by one column; ties fall back to name so rows never jump around on a refresh. */
export function sortStudents(
  students: AssessmentMonitorStudent[],
  key: SortKey,
  dir: SortDir
): AssessmentMonitorStudent[] {
  const value = (s: AssessmentMonitorStudent): number | string => {
    if (key === 'status') return STATUS_RANK[s.status]
    if (key === 'progress') return s.status === 'not_started' ? -1 : progressPercent(s)
    if (key === 'saved') return s.lastActivityAt ? new Date(s.lastActivityAt).getTime() : 0
    return s.name.toLocaleLowerCase()
  }
  const sign = dir === 'asc' ? 1 : -1
  return [...students].sort((a, b) => {
    const x = value(a)
    const y = value(b)
    const c = x < y ? -1 : x > y ? 1 : 0
    return c * sign || byName(a, b)
  })
}

/** Questions answered as a whole percent of those drawn; 0 when none were drawn. */
export const progressPercent = (
  s: Pick<AssessmentMonitorStudent, 'answeredCount' | 'questionCount'>
) => (s.questionCount > 0 ? Math.round((s.answeredCount / s.questionCount) * 100) : 0)

/** "3 of 4 answered", "4 of 4 answered", or a dash before the learner starts. */
export const progressText = (s: AssessmentMonitorStudent): string =>
  s.status === 'not_started' ? '—' : `${s.answeredCount} of ${s.questionCount} answered`

/** "Oct 9, 12:42 PM", or a dash for no time. */
export function whenText(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** "30 min limit", or null when there is none. */
export const limitText = (minutes: number | null): string | null =>
  minutes ? `${minutes} min limit` : null

/** How many queries show before "Show N older". */
export const QUERIES_SHOWN = 2

/** One thing the monitor can show at a time: an assessment of the course, one scheduled outside it, or SQL practice. */
export interface MonitorEntry {
  id: string
  label: string
  /** Scheduled directly in the Simulator rather than through the course. */
  outside: boolean
  delivery: AssessmentMonitorDelivery | null
  sql: boolean
}

export const SQL_ENTRY_ID = 'sql'

/** The tab for a delivery: its title, with the attempt when there are retakes ("Pre-assessment, attempt 2"). */
export const entryLabel = (d: AssessmentMonitorDelivery, outside: boolean): string => {
  const attempt = d.tags.find((t) => t.startsWith('attempt'))
  return `${d.label}${attempt ? `, ${attempt}` : ''}${outside ? ' (outside the course)' : ''}`
}

/** Course assessments in course order, then any scheduled outside the course, then SQL practice. */
export function monitorEntries(data: CohortAssessmentMonitor | null, sql: boolean): MonitorEntry[] {
  const entries: MonitorEntry[] = []
  for (const d of data?.deliveries ?? [])
    entries.push({ id: d.id, label: entryLabel(d, false), outside: false, delivery: d, sql: false })
  for (const d of data?.other ?? [])
    entries.push({ id: d.id, label: entryLabel(d, true), outside: true, delivery: d, sql: false })
  if (sql)
    entries.push({
      id: SQL_ENTRY_ID,
      label: 'SQL practice',
      outside: false,
      delivery: null,
      sql: true,
    })
  return entries
}
