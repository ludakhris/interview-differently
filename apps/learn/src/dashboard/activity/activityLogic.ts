// Small pure helpers for the activity feature (#69 E). All days are UTC dates, like the API.

/** "1 h 05 min", "12 min", "< 1 min", "0 min". Whole minutes: sub-minute time is shown, not rounded to 0. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s === 0) return '0 min'
  if (s < 60) return '< 1 min'
  const total = Math.round(s / 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  return `${h} h ${String(m).padStart(2, '0')} min`
}

/** Minutes with one decimal, the unit the CSV uses. */
export const minutesOf = (seconds: number): string => (Math.max(0, seconds) / 60).toFixed(1)

export const utcDay = (d: Date): string => d.toISOString().slice(0, 10)
const DAY_MS = 24 * 3600 * 1000
const startMs = (day: string): number => Date.parse(`${day}T00:00:00.000Z`)

export type RangePreset = 'last7' | 'last30' | 'custom'

/** The date range of a preset, ending today (UTC). */
export function presetRange(preset: 'last7' | 'last30', now: Date): { from: string; to: string } {
  const n = preset === 'last7' ? 7 : 30
  const to = utcDay(now)
  return { from: utcDay(new Date(startMs(to) - (n - 1) * DAY_MS)), to }
}

/** null when the custom range may be asked for, otherwise what is wrong with it. */
export function rangeProblem(from: string, to: string): string | null {
  const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && utcDay(new Date(startMs(s))) === s
  if (!ok(from) || !ok(to)) return 'Choose a start and an end date.'
  if (from > to) return 'The start date must not be after the end date.'
  if ((startMs(to) - startMs(from)) / DAY_MS + 1 > 366) return 'Choose at most 366 days.'
  return null
}

/** Monday of the week a day is in (weeks start Monday). */
export function weekStart(day: string): string {
  const dow = new Date(startMs(day)).getUTCDay() // 0 = Sunday
  return utcDay(new Date(startMs(day) - ((dow + 6) % 7) * DAY_MS))
}

export interface Bar {
  /** First day of the bar (the Monday, for a week). */
  start: string
  /** Last day included in the bar. */
  end: string
  seconds: number
}

/**
 * Bars for the chart: one per day, or one per week (Monday to Sunday, clipped to the range) when
 * there are more than `maxBars` days.
 */
export function chartBars(days: { day: string; seconds: number }[], maxBars = 45): Bar[] {
  if (days.length <= maxBars)
    return days.map((d) => ({ start: d.day, end: d.day, seconds: d.seconds }))
  const weeks = new Map<string, Bar>()
  for (const d of days) {
    const key = weekStart(d.day)
    const w = weeks.get(key) ?? { start: d.day, end: d.day, seconds: 0 }
    w.seconds += d.seconds
    if (d.day < w.start) w.start = d.day
    if (d.day > w.end) w.end = d.day
    weeks.set(key, w)
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, w]) => w)
}

/** Whether the learner has used the page recently: input within `idleMs` before `now`. */
export const isActive = (lastInputAt: number | null, now: number, idleMs: number): boolean =>
  lastInputAt !== null && now - lastInputAt <= idleMs

/** "Oct 7, 14:05 UTC" for a timestamp. */
export function timeUtc(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${date}, ${d.toISOString().slice(11, 16)} UTC`
}

/** "Tue, Oct 7" for a UTC day. */
export const dayLabel = (day: string): string =>
  new Date(startMs(day)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

export interface LearningTarget {
  cohortId: string
  itemId: string | null
}

/** Learner pages under /lms/learning that are not a cohort. */
const NOT_COHORTS = new Set(['outcomes', 'profile'])

/** /lms/learning/:cohortId[/:itemId] to its ids; null for any other page. */
export function parseLearningPath(pathname: string): LearningTarget | null {
  const m = /^\/lms\/learning\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname)
  if (!m || NOT_COHORTS.has(m[1])) return null
  try {
    return { cohortId: decodeURIComponent(m[1]), itemId: m[2] ? decodeURIComponent(m[2]) : null }
  } catch {
    return null
  }
}
