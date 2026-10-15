import type { StatusFailures, SystemStatus } from '@id/types'

/** How the System status page reads the API's answer (GitHub issue #92): one tone and line per row, worst first. */

export type Tone = 'ok' | 'warn' | 'bad'
type Grading = SystemStatus['simulator']['grading']
type Spark = SystemStatus['spark']
type Failures = StatusFailures<string>['failures']

/** One row's state: its pill, and what the banner says when it is the worst. */
export interface RowState {
  tone: Tone
  word: string
  /** For the banner; null when the row is fine. */
  title: string | null
  detail: string | null
}

const HOUR = 3_600_000
export const n = (x: number) => x.toLocaleString('en-US')
const times = (x: number) => (x === 1 ? 'once' : `${n(x)} times`)
export const failuresWord = (x: number) => `${n(x)} ${x === 1 ? 'failure' : 'failures'}`
const lastHour = (f: Failures) => f.perHour.at(-1) ?? 0
const fine = (word = 'Working'): RowState => ({ tone: 'ok', word, title: null, detail: null })

/** "Grading can run": the self-test. */
export function gradingRunState(t: Grading['selfTest']): RowState {
  if (t.status === 'failing')
    return {
      tone: 'bad',
      word: 'Failing',
      title: 'Grading is failing',
      detail: t.reason ?? 'Learners’ SQL answers may not be graded.',
    }
  if (t.status === 'busy')
    return {
      tone: 'warn',
      word: 'Busy, not checked',
      title: 'Grading is busy',
      detail: 'Every grading slot was busy with learners, so the self-test could not run.',
    }
  return fine()
}

/** A "… for learners" row: failing if they hit failures in the last hour, a warning if earlier in the window. */
function learnersState(f: Failures, title: string, what: string): RowState {
  const recent = lastHour(f)
  if (recent > 0)
    return {
      tone: 'bad',
      word: 'Failed in the last hour',
      title,
      detail: `${what} failed ${times(recent)} in the last hour, through no fault of the learners.`,
    }
  if (f.count > 0) return { tone: 'warn', word: 'Failed earlier today', title: null, detail: null }
  return fine()
}

/** "Grading for learners". */
export const gradingLearnersState = (g: Grading) =>
  learnersState(g.failures, 'Learners hit grading failures in the last hour', 'Grading')

/** "Videos are set up". */
export function videoSetupState(s: Spark['setup']): RowState {
  if (s.status === 'ok') return fine()
  return {
    tone: 'bad',
    word: 'Not set up',
    title: 'Videos are not set up',
    detail: s.problems.join(' ') || 'Lessons made for learners cannot be written or linked.',
  }
}

/** "Video player". */
export function playerState(p: Spark['player']): RowState {
  if (p.status === 'ok') return fine()
  if (p.status === 'not-set-up')
    return {
      tone: 'warn',
      word: 'Not set up',
      title: 'The video player is not set up',
      detail: 'There is no player address (SPARK_WEB_URL) to check.',
    }
  return {
    tone: 'bad',
    word: 'Failing',
    title: 'The video player is not answering',
    detail: p.reason ?? 'Learners may not be able to watch their videos.',
  }
}

/** "Videos for learners". */
export const videoLearnersState = (s: Spark) =>
  learnersState(
    s.lessons.failures,
    'Learners could not get videos in the last hour',
    'Making a video'
  )

const RANK: Record<Tone, number> = { bad: 2, warn: 1, ok: 0 }

/** The whole page in one line: the worst row first (in page order among equals), else all working. */
export function overall(s: SystemStatus): { tone: Tone; title: string; detail: string } {
  const g = s.simulator.grading
  const rows = [
    gradingRunState(g.selfTest),
    gradingLearnersState(g),
    videoSetupState(s.spark.setup),
    playerState(s.spark.player),
    videoLearnersState(s.spark),
  ].filter((r) => r.title !== null)
  if (rows.length > 0) {
    const worst = rows.reduce((a, b) => (RANK[b.tone] > RANK[a.tone] ? b : a))
    const more = rows.length - 1
    return {
      tone: worst.tone,
      title: worst.title!,
      detail:
        `${worst.detail}` +
        (more > 0 ? ` ${n(more)} more ${more === 1 ? 'problem' : 'problems'} below.` : ''),
    }
  }
  const hours = g.failures.windowHours
  const earlier = [
    g.failures.count > 0 &&
      `${n(g.failures.count)} grading ${g.failures.count === 1 ? 'failure' : 'failures'}`,
    s.spark.lessons.failures.count > 0 &&
      `${n(s.spark.lessons.failures.count)} video ${s.spark.lessons.failures.count === 1 ? 'failure' : 'failures'}`,
  ].filter((x): x is string => !!x)
  return {
    tone: 'ok',
    title: 'All systems working',
    detail:
      earlier.length === 0
        ? `No failures in the last ${hours} hours.`
        : `${earlier.join(' and ')} in the last ${hours} hours, none in the last hour.`,
  }
}

/** For example "1,300 MB of its 2,048 MB limit", or the limit alone where memory cannot be read. */
export function memoryText(t: Grading['selfTest']): string {
  const mb = (x: number) => `${n(x)} MB`
  return t.peakMb === null
    ? `Not measured on this server (limit ${mb(t.limitMb)})`
    : `${mb(t.peakMb)} of its ${mb(t.limitMb)} limit`
}

/** Memory used as a share of the limit, 0 to 100; null where it cannot be read. */
export const memoryPct = (t: Grading['selfTest']): number | null =>
  t.peakMb === null ? null : Math.min(100, Math.round((t.peakMb / t.limitMb) * 100))

/** What kind of failure it was, in plain words. */
export const KIND_TEXT: Record<string, string> = {
  infra: 'Grading would not run',
  busy: 'Grading was busy',
  'not-configured': 'The AI service is not set up',
  'no-lesson': 'No usable video was written',
}
export const kindText = (kind: string): string => KIND_TEXT[kind] ?? kind

/** "just now", "12 min ago", "3 hours ago", "4 days ago". */
export function ago(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime()
  if (Number.isNaN(ms)) return '—'
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`
  return `${Math.floor(h / 24)} days ago`
}

const clock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

/** "2:48 PM" today, else "Oct 14, 2:48 PM". */
export function shortWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  if (d.toDateString() === new Date().toDateString()) return clock(d)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Each hour of the window, oldest first: how many failed in it, and a label saying when. */
export function hourBlocks(f: Failures, now = Date.now()): { count: number; label: string }[] {
  const len = f.perHour.length
  return f.perHour.map((count, i) => {
    const end = new Date(now - (len - 1 - i) * HOUR)
    const start = new Date(end.getTime() - HOUR)
    return { count, label: `${clock(start)} to ${clock(end)}: ${failuresWord(count)}` }
  })
}

/** The hour blocks, read aloud: for example "Grading failures per hour, last 24 hours: 3 in all, at most 2 in one hour." */
export function blocksLabel(f: Failures, what: string): string {
  const most = Math.max(0, ...f.perHour)
  return f.count === 0
    ? `${what} failures per hour, last ${f.windowHours} hours: none.`
    : `${what} failures per hour, last ${f.windowHours} hours: ${n(f.count)} in all, at most ${n(most)} in one hour.`
}

/** Under the hour blocks: "No failures", or "3 failures in 2 of 24 hours". */
export const blocksSummary = (f: Failures): string =>
  f.count === 0
    ? 'No failures'
    : `${failuresWord(f.count)} in ${n(f.perHour.filter((x) => x > 0).length)} of ${f.windowHours} hours`
