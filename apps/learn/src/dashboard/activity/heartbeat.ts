import { isActive, type LearningTarget } from './activityLogic'

export const BEAT_MS = 30_000
export const IDLE_MS = 60_000
export const MAX_BACKOFF_MS = 5 * 60_000
/** After moving to another item, the next beat comes this soon (the server ignores beats under 10 s apart). */
const AFTER_MOVE_MS = 10_500

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const

export interface HeartbeatEnv {
  /** Posts one beat. Rejects on any failure. `keepalive`: the page may be going away. */
  send: (target: LearningTarget, keepalive: boolean) => Promise<void>
  doc?: Document
  win?: Window
  now?: () => number
}

export interface Heartbeat {
  /** The page being viewed; null for a page that is not a cohort (nothing is sent). */
  setTarget: (target: LearningTarget | null) => void
  stop: () => void
}

/**
 * Sends a beat about every 30 s while the page is visible and there was input within the last
 * 60 s. Nothing while hidden or idle; one beat on the first input after idle; a last beat when the
 * page is hidden or closed after recent activity. Failures are silent and back off (30 s doubling to
 * 5 min); a success resets the pace. The server does all the counting, so this never reports a duration.
 */
export function startHeartbeat(env: HeartbeatEnv): Heartbeat {
  const doc = env.doc ?? document
  const win = env.win ?? window
  const now = env.now ?? Date.now
  let target: LearningTarget | null = null
  let lastInput: number | null = null
  let active = false
  let failures = 0
  let inFlight = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const visible = () => doc.visibilityState === 'visible'
  const recentlyActive = () => isActive(lastInput, now(), IDLE_MS)
  const delay = () => Math.min(BEAT_MS * 2 ** failures, MAX_BACKOFF_MS)

  function beat(keepalive = false) {
    if (stopped || !target || inFlight) return
    inFlight = true
    let sent: Promise<void>
    try {
      sent = env.send(target, keepalive)
    } catch {
      sent = Promise.reject(new Error('send failed'))
    }
    sent
      .then(
        () => {
          const recovered = failures > 0
          failures = 0
          // Back to the normal pace right away, not after the slow wait that was already set.
          if (recovered && timer !== undefined) schedule(BEAT_MS)
        },
        () => {
          failures = Math.min(failures + 1, 4)
          // Reschedule at the slower pace.
          if (timer !== undefined) schedule(delay())
        }
      )
      .finally(() => {
        inFlight = false
      })
  }

  function tick() {
    timer = undefined
    if (stopped) return
    if (visible() && recentlyActive()) beat()
    else active = false
    if (visible()) schedule(delay())
  }

  function schedule(ms: number) {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(tick, ms)
  }

  function onInput() {
    if (!visible()) return
    lastInput = now()
    if (!active && visible()) {
      active = true
      beat()
    }
    if (timer === undefined && visible()) schedule(delay())
  }

  function leaving() {
    if (visible() && active && recentlyActive()) beat(true)
    active = false
  }

  function onVisibility() {
    if (visible()) {
      // Back on the page: the next input starts counting again.
      active = false
      schedule(delay())
    } else {
      if (active && recentlyActive()) beat(true)
      active = false
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
    }
  }

  const opts = { passive: true, capture: true } as const
  for (const e of INPUT_EVENTS) doc.addEventListener(e, onInput, opts)
  // scroll does not bubble: capture catches scrolling inside any element.
  doc.addEventListener('scroll', onInput, opts)
  doc.addEventListener('visibilitychange', onVisibility)
  win.addEventListener('pagehide', leaving)
  if (visible()) schedule(delay())

  return {
    setTarget(next) {
      const moved = next?.cohortId !== target?.cohortId || next?.itemId !== target?.itemId
      target = next
      if (!moved || !next) return
      if (active && visible() && recentlyActive()) {
        beat()
        schedule(AFTER_MOVE_MS)
      }
    },
    stop() {
      stopped = true
      if (timer !== undefined) clearTimeout(timer)
      for (const e of INPUT_EVENTS) doc.removeEventListener(e, onInput, opts)
      doc.removeEventListener('scroll', onInput, opts)
      doc.removeEventListener('visibilitychange', onVisibility)
      win.removeEventListener('pagehide', leaving)
    },
  }
}
