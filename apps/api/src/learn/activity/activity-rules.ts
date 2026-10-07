// Pure rules for the activity log (#69 E). Kept free of Prisma so they are tested directly.
import type { ActivityAverages } from '../activity-types'

/** A beat further than this from the learner's last one starts a new row instead of adding to it. */
export const JOIN_WINDOW_S = 90
/** Most seconds one beat can add, whatever the gap or the client says. */
export const MAX_BEAT_S = 60
/** Beats closer than this to the last one are ignored (the client sends one about every 30 s). */
export const MIN_BEAT_GAP_S = 10
/** A connected tool's estimate is capped at 4 hours. */
export const MAX_TOOL_ESTIMATE_S = 4 * 3600
/** A cohort that ended more than this long ago takes no more time. */
export const ENDED_GRACE_MS = 24 * 3600 * 1000
export const MAX_RANGE_DAYS = 366
export const DEFAULT_RANGE_DAYS = 30

const DAY_MS = 24 * 3600 * 1000

export const utcDay = (d: Date): string => d.toISOString().slice(0, 10)
const dayStart = (day: string): number => Date.parse(`${day}T00:00:00.000Z`)

export type BeatDecision =
  | { action: 'ignore' }
  /** Open a row for this item. `seconds` is credited to it at once (a switch within the window). */
  | { action: 'new'; seconds: number }
  | { action: 'add'; seconds: number }

/**
 * What a heartbeat does, from the learner's latest row for today (any item). The gap is measured
 * against the latest beat across all items, so alternating items (two tabs) cannot earn more than
 * the wall-clock time between beats. A beat for the same item adds the gap to its row. A beat for a
 * different item inside the window opens a row for the new item and credits it min(gap, 60 s), so
 * switching items does not lose the time. A gap over the window credits nothing. The client's own
 * clock and duration are never read.
 */
export function decideBeat(
  last: { lastSeenAt: Date; itemId: string | null } | null,
  itemId: string | null,
  now: Date
): BeatDecision {
  if (!last) return { action: 'new', seconds: 0 }
  const gap = (now.getTime() - last.lastSeenAt.getTime()) / 1000
  if (gap < MIN_BEAT_GAP_S) return { action: 'ignore' }
  if (gap > JOIN_WINDOW_S) return { action: 'new', seconds: 0 }
  const seconds = Math.min(Math.floor(gap), MAX_BEAT_S)
  return last.itemId !== itemId ? { action: 'new', seconds } : { action: 'add', seconds }
}

/**
 * A connected tool's time, from launch to score return: never negative, at most 4 hours, and split
 * at UTC midnight so a row never straddles two days. Seconds are whole.
 */
export function splitToolEstimate(
  startedAt: Date,
  endedAt: Date
): { day: string; startedAt: Date; lastSeenAt: Date; seconds: number }[] {
  const total = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)
  if (!Number.isFinite(total) || total <= 0) return []
  const end = new Date(startedAt.getTime() + Math.min(total, MAX_TOOL_ESTIMATE_S) * 1000)
  const out: { day: string; startedAt: Date; lastSeenAt: Date; seconds: number }[] = []
  let from = startedAt
  while (from.getTime() < end.getTime()) {
    const nextMidnight = new Date(dayStart(utcDay(from)) + DAY_MS)
    const to = nextMidnight.getTime() < end.getTime() ? nextMidnight : end
    const seconds = Math.floor((to.getTime() - from.getTime()) / 1000)
    if (seconds > 0) out.push({ day: utcDay(from), startedAt: from, lastSeenAt: to, seconds })
    from = to
  }
  return out
}

export interface DateRange {
  from: string
  to: string
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const validDay = (s: unknown): s is string => {
  if (typeof s !== 'string' || !DAY_RE.test(s)) return false
  const ms = dayStart(s)
  return !Number.isNaN(ms) && utcDay(new Date(ms)) === s
}

/** Days between two YYYY-MM-DD dates, both included. */
export const daysInclusive = (from: string, to: string): number =>
  Math.round((dayStart(to) - dayStart(from)) / DAY_MS) + 1

/** Every day from `from` to `to`, oldest first. */
export function eachDay(from: string, to: string): string[] {
  const n = daysInclusive(from, to)
  return Array.from({ length: n }, (_, i) => utcDay(new Date(dayStart(from) + i * DAY_MS)))
}

export const DEFAULT_TZ = 'UTC'

/**
 * Reads ?tz: an IANA timezone name (America/New_York), default UTC. Unknown names are an error
 * (the caller turns it into a 400). The shape check keeps odd text (offsets, spaces) out of the
 * SQL timezone argument; the value is also passed as a bound parameter, never spliced in.
 */
export function parseTz(tz: unknown): { tz: string } | { error: string } {
  if (tz === undefined || tz === null || tz === '') return { tz: DEFAULT_TZ }
  const bad = { error: 'tz must be a timezone name such as America/New_York' }
  if (typeof tz !== 'string' || tz.length > 64) return bad
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return bad
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    return bad
  }
  return { tz }
}

/** The calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function localDay(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/**
 * Reads ?from&to (dates in the viewer's timezone). Default: the last 30 days up to today in that
 * timezone. Returns an error message for an invalid date, a reversed range, or a range over 366
 * days; the caller turns it into a 400.
 */
export function parseRange(
  from: unknown,
  to: unknown,
  now = new Date(),
  tz = DEFAULT_TZ
): { range: DateRange } | { error: string } {
  const present = (v: unknown) => v !== undefined && v !== null && v !== ''
  if (present(from) && !validDay(from)) return { error: 'from must be a date, YYYY-MM-DD' }
  if (present(to) && !validDay(to)) return { error: 'to must be a date, YYYY-MM-DD' }
  const end = present(to) ? (to as string) : localDay(now, tz)
  const start = present(from)
    ? (from as string)
    : utcDay(new Date(dayStart(end) - (DEFAULT_RANGE_DAYS - 1) * DAY_MS))
  if (start > end) return { error: 'from must not be after to' }
  if (daysInclusive(start, end) > MAX_RANGE_DAYS)
    return { error: `The date range can be at most ${MAX_RANGE_DAYS} days` }
  return { range: { from: start, to: end } }
}

/**
 * The cohort averages. Everything divides the same total: by every listed learner, by learners
 * with time, by (learner, day) pairs with time, and the learners active per day over every day of
 * the range (quiet days included). Nothing divides by zero.
 */
export function computeAverages(
  totalSeconds: number,
  learners: { totalSeconds: number; activeDays: number }[],
  dayCount: number,
  learnersByDay: number[]
): ActivityAverages {
  const active = learners.filter((l) => l.totalSeconds > 0).length
  const learnerDays = learners.reduce((n, l) => n + l.activeDays, 0)
  const per = (n: number, d: number) => (d > 0 ? Math.round(n / d) : 0)
  return {
    perLearnerSeconds: per(totalSeconds, learners.length),
    perActiveLearnerSeconds: per(totalSeconds, active),
    perActiveDaySeconds: per(totalSeconds, learnerDays),
    activeLearners: active,
    learnersPerDay:
      dayCount > 0
        ? Math.round((learnersByDay.reduce((n, x) => n + x, 0) / dayCount) * 10) / 10
        : 0,
  }
}

/** A CSV opens in Excel as UTF-8 only with this byte order mark (names with accents). */
export const CSV_BOM = '\uFEFF'
/** More rows than this are refused: narrow the date range. */
export const MAX_CSV_ROWS = 100_000

/**
 * One CSV cell. A cell a spreadsheet would read as a formula (starts with = + - @, tab or CR) gets
 * a leading apostrophe, so names and titles cannot run anything when opened in Excel or Sheets.
 * Email cells use the same rule: a real address does not start with + or -, so nothing changes in
 * practice, and one that does is safer shown with the apostrophe.
 */
export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Minutes with one decimal, for the CSV. */
export const minutes1 = (seconds: number): string => (seconds / 60).toFixed(1)

export const CSV_COLUMNS = [
  'learner',
  'email',
  'start_utc',
  'date_local',
  'item',
  'minutes',
] as const

export interface CsvRow {
  name: string
  email: string | null
  /** When the session started (UTC). */
  startedAt: Date
  /** The session's start day in the viewer's timezone. */
  dateLocal: string
  item: string
  seconds: number
}

/** One row per session: start in UTC (ISO), its local date, the activity and the minutes. */
export function activityCsv(rows: CsvRow[]): string {
  const lines = rows.map((r) =>
    [r.name, r.email, r.startedAt.toISOString(), r.dateLocal, r.item, minutes1(r.seconds)]
      .map(csvCell)
      .join(',')
  )
  return CSV_BOM + [CSV_COLUMNS.join(','), ...lines].join('\r\n') + '\r\n'
}
