import type {
  CheckpointAnswerState,
  CheckpointFrameMessage,
  CheckpointRun,
  CheckpointTask,
  CheckpointView,
} from '@id/types'

/**
 * The chat checkpoint's rules that do not need React (GitHub issue #90): which request is on screen, what has been
 * answered, and the messages the page sends to the LMS page around it.
 */

/** A request is settled once it has a graded answer (right or wrong) or a pass. Asking for help alone is not one. */
export const isSettled = (a: CheckpointAnswerState | undefined): boolean =>
  !!a && (a.passed || a.tries > 0)

/** The request to work on: the first one not settled yet, or null when there is none (or the server says done). */
export function firstOpenRef(view: CheckpointView): string | null {
  if (view.done) return null
  return view.tasks.find((t) => !isSettled(view.answers[t.ref]))?.ref ?? null
}

/** The requests in the thread: every settled one, and the one being worked on. Later ones have not arrived yet. */
export function shownTasks(view: CheckpointView, active: string | null): CheckpointTask[] {
  return view.tasks.filter((t) => t.ref === active || isSettled(view.answers[t.ref]))
}

export function progress(view: CheckpointView): { answered: number; right: number; total: number } {
  const states = view.tasks.map((t) => view.answers[t.ref])
  return {
    answered: states.filter(isSettled).length,
    right: states.filter((a) => a?.correct).length,
    total: view.tasks.length,
  }
}

/** What the thread shows under a settled request. */
export function replyKind(a: CheckpointAnswerState): 'right' | 'passed' | 'missed' {
  if (a.correct) return 'right'
  return a.passed ? 'passed' : 'missed'
}

/** The line the chat opens with: a practice slot's own intro, else the placement's scenario. */
export function openingLine(view: CheckpointView): string | null {
  return view.practice?.intro ?? view.scenario
}

/** A practice slot that has no requests to show yet: what to show instead of the chat. Null: show the chat. */
export function practiceGate(view: CheckpointView): 'writing' | 'pending' | 'rejected' | null {
  const status = view.practice?.status
  return !status || status === 'ready' ? null : status
}

/** "PM" for "Priya, Marketing"; at most two letters. */
export function initials(who: string): string {
  return who
    .split(/[\s,·]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join('')
}

/** "Priya" for "Priya, Marketing"; the fallback when the request has no sender. */
export function firstName(from: string | null, fallback = 'them'): string {
  return from?.split(/[\s,·]+/).find(Boolean) ?? fallback
}

/** Colleagues who already had the data a missed request asked for. Never the one who asked. */
export const BACKUP_COLLEAGUES = ['Jeremy', 'Maya', 'Tomás', 'Aisha', 'Ken', 'Grace']

/** The same colleague every time for the same request, so a reloaded chat reads the same. */
export function backupColleague(ref: string, from: string | null): string {
  let h = 0
  for (const ch of ref) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const sender = firstName(from, '').toLowerCase()
  const n = BACKUP_COLLEAGUES.length
  for (let i = 0; i < n; i++) {
    const name = BACKUP_COLLEAGUES[(h + i) % n]!
    if (name.toLowerCase() !== sender) return name
  }
  return BACKUP_COLLEAGUES[h % n]!
}

/** What the colleague says after a missed request, before the next one arrives. */
export const missReply = (ref: string, from: string | null): string =>
  `That didn't look right, but we got the data from ${backupColleague(ref, from)}, who already had it. Thanks anyway!`

/** Rows of a sent result shown in the learner's reply. */
export const REPLY_ROWS = 3

/** One cell of a result, as text. */
export const cellText = (v: unknown): string =>
  v === null || v === undefined ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v)

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "4 rows · columns region, total" */
export function shapeLabel(expected: { columns: string[]; rowCount: number }): string {
  const cols = expected.columns
  return `${plural(expected.rowCount, 'row', 'rows')} · ${cols.length === 1 ? 'column' : 'columns'} ${cols.join(', ')}`
}

/** Rows of a run shown on screen; the check marks the same first rows. */
export const SHOWN_ROWS = 8

/** The server's right/wrong marks for the rows on screen only; undefined when the run was not checked. */
export function visibleMarks(run: CheckpointRun): boolean[] | undefined {
  if (!run.check || !run.preview) return undefined
  return run.check.rowHits.slice(0, Math.min(run.preview.rows.length, SHOWN_ROWS))
}

/** "4 rows, 3 right": the short line a screen reader hears after a run, counted over the rows on screen. */
export function runSummary(run: CheckpointRun): string {
  if (run.error) return `It did not run: ${run.error}`
  if (!run.preview) return ''
  const n = run.preview.rowCount
  const rows = plural(n, 'row', 'rows')
  const marks = visibleMarks(run)
  if (!marks) return rows
  if (run.check?.correct) return `${rows}, matches`
  const right = marks.filter(Boolean).length
  return marks.length < n
    ? `${rows}, ${right} of the first ${marks.length} right`
    : `${rows}, ${right} right`
}

/** Why a sent answer missed, in the learner's words. */
export function missReason(r: { error: string | null; reason: string | null }): string {
  return r.error ? `It did not run: ${r.error}` : (r.reason ?? 'The rows do not match')
}

/** True inside an iframe (the LMS course page). Comparing a cross-origin parent is allowed. */
export const isFramed = (win: Window = window): boolean => win.parent !== win

/**
 * The origin of the page that framed this one, or '*' when the browser does not say. `location.ancestorOrigins`
 * names the parent exactly (Chromium, Safari). `document.referrer` is deliberately not used: the launch reaches
 * this page through the API's auto-submitted LTI form and a redirect, so the referrer is the API, not the LMS page,
 * and a message aimed at it would be dropped.
 */
export function parentOrigin(win: Window = window): string {
  const ancestor = win.location?.ancestorOrigins?.[0]
  if (!ancestor || ancestor === 'null') return '*'
  try {
    return new URL(ancestor).origin
  } catch {
    return '*'
  }
}

/**
 * Tells the LMS page around the frame that something changed. Sent only when framed, to the parent's origin when
 * the browser names it; the message carries no score or answer (the LMS reads the evidence itself through the
 * Simulator feed, and checks the sender's origin), so '*' is the safe fallback.
 */
export function postToParent(message: CheckpointFrameMessage, win: Window = window): boolean {
  if (!isFramed(win)) return false
  win.parent.postMessage(message, parentOrigin(win))
  return true
}
