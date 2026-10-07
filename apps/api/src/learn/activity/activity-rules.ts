// Pure rules for the activity log (#69 E). Kept free of Prisma so they are tested directly.

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
  | { action: 'new' }
  | { action: 'add'; seconds: number }

/**
 * What a heartbeat does, from the learner's latest row for today (any item). The gap is measured
 * against the latest row across all items, so alternating items cannot earn time in parallel.
 * Time is only ever added to the row of the same item; a different item opens a new row, so the
 * interval is credited to nobody (conservative). The client's own clock and duration are never read.
 */
export function decideBeat(
  last: { lastSeenAt: Date; itemId: string | null } | null,
  itemId: string | null,
  now: Date
): BeatDecision {
  if (!last) return { action: 'new' }
  const gap = (now.getTime() - last.lastSeenAt.getTime()) / 1000
  if (gap < MIN_BEAT_GAP_S) return { action: 'ignore' }
  if (gap > JOIN_WINDOW_S || last.itemId !== itemId) return { action: 'new' }
  return { action: 'add', seconds: Math.min(Math.floor(gap), MAX_BEAT_S) }
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

/**
 * Reads ?from&to. Default: the last 30 days up to today (UTC). Returns an error message for an
 * invalid date, a reversed range, or a range over 366 days; the caller turns it into a 400.
 */
export function parseRange(
  from: unknown,
  to: unknown,
  now = new Date()
): { range: DateRange } | { error: string } {
  const present = (v: unknown) => v !== undefined && v !== null && v !== ''
  if (present(from) && !validDay(from)) return { error: 'from must be a date, YYYY-MM-DD' }
  if (present(to) && !validDay(to)) return { error: 'to must be a date, YYYY-MM-DD' }
  const end = present(to) ? (to as string) : utcDay(now)
  const start = present(from)
    ? (from as string)
    : utcDay(new Date(dayStart(end) - (DEFAULT_RANGE_DAYS - 1) * DAY_MS))
  if (start > end) return { error: 'from must not be after to' }
  if (daysInclusive(start, end) > MAX_RANGE_DAYS)
    return { error: `The date range can be at most ${MAX_RANGE_DAYS} days` }
  return { range: { from: start, to: end } }
}

/**
 * One CSV cell. A cell a spreadsheet would read as a formula (starts with = + - @, tab or CR) gets
 * a leading apostrophe, so names and titles cannot run anything when opened in Excel or Sheets.
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
  'date',
  'item',
  'kind',
  'minutes',
  'estimated',
] as const

export interface CsvRow {
  name: string
  email: string | null
  day: string
  item: string
  kind: string
  seconds: number
  estimated: boolean
}

export function activityCsv(rows: CsvRow[]): string {
  const lines = rows.map((r) =>
    [r.name, r.email, r.day, r.item, r.kind, minutes1(r.seconds), r.estimated ? 'yes' : 'no']
      .map(csvCell)
      .join(',')
  )
  return [CSV_COLUMNS.join(','), ...lines].join('\r\n') + '\r\n'
}

/**
 * When the learner launched the tool, read from the item's progress data (`launchedAt`, an ISO
 * time written by the launch step). Null, so no estimate is recorded, when it is missing, invalid,
 * in the future, or not after the previous score came back (a launch that belongs to an earlier
 * attempt is not this attempt's time).
 */
export function toolLaunchTime(data: unknown, now: Date): Date | null {
  if (!data || typeof data !== 'object') return null
  const d = data as { launchedAt?: unknown; at?: unknown }
  if (typeof d.launchedAt !== 'string') return null
  const launched = Date.parse(d.launchedAt)
  if (Number.isNaN(launched) || launched > now.getTime()) return null
  const previous = typeof d.at === 'string' ? Date.parse(d.at) : NaN
  if (!Number.isNaN(previous) && launched <= previous) return null
  return new Date(launched)
}
