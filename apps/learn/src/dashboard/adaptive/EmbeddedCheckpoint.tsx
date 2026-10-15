import type { AdaptiveSyncResult, IntakeLevel, LearnerItem } from '@id/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApiSend, useLoad } from '../api'
import { useApp } from '../app-context'
import { submitLaunchForm } from '../launchForm'
import { PlanChangeOverlay } from './PlanChangeOverlay'
import { storageReply } from './platformStorage'

interface Launch {
  action: string
  fields: Record<string, string>
  /** For an embedded tool: whose messages to trust (the tool's login pages, and its page in the frame). */
  embed?: { storageOrigin: string; frameOrigin: string }
}

interface State {
  itemId: string
  diagnostic: boolean
  intake: IntakeLevel | null
  completed: boolean
}

const MIN_HEIGHT = 560
const MAX_HEIGHT = 2400

/**
 * An adaptive checkpoint (GitHub issue #90): the Simulator's chat page, launched by LTI into a frame on this course
 * page. Before a diagnostic the LMS asks its own intake question. The frame keeps its login state here (LTI platform
 * storage) and says when the learner answered; this page then reads the evidence itself (sync) and shows any change
 * to the learner's path.
 */
export function EmbeddedCheckpoint(props: {
  item: LearnerItem
  onChange: (i: LearnerItem) => void
  nextHref: string
  nextLabel: string
}) {
  const { item } = props
  const { href } = useApp()
  const send = useApiSend()
  const base = `/learn/me/cohorts/${item.cohortId}/items/${item.id}`
  const state = useLoad<State>(`${base}/adaptive`)
  const [launch, setLaunch] = useState<Launch | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [height, setHeight] = useState(MIN_HEIGHT)
  const [changes, setChanges] = useState<AdaptiveSyncResult | null>(null)
  const [completed, setCompleted] = useState(item.status === 'completed')
  const store = useRef(new Map<string, string>())
  const frame = useRef<HTMLIFrameElement>(null)
  // The server's cursor for "what changed since": null on the first sync (the server starts from its own clock, so
  // what changed before this visit is not news), then only the cursor it returned, moved on after a sync succeeds.
  const since = useRef<string | null>(null)
  const frameName = `lti-frame-${item.id}`

  const sync = useCallback(
    async (retry = true) => {
      try {
        const out = await send<AdaptiveSyncResult>('POST', `${base}/adaptive/sync`, {
          since: since.current,
        })
        since.current = out.at
        if (out.completed) setCompleted(true)
        if (out.planAdded.length > 0 || out.planSkipped.length > 0) setChanges(out)
      } catch {
        // Once more after a moment: after the last answer there is no next answer to sync again.
        if (retry) window.setTimeout(() => void sync(false), 3000)
      }
    },
    [base, send]
  )

  // Messages from the frame: its login pages keep state here; its page reports answers and its height.
  useEffect(() => {
    if (!launch?.embed) return
    const { storageOrigin, frameOrigin } = launch.embed
    const onMessage = (e: MessageEvent) => {
      // Only the launched frame: its login pages (the tool's API) and then its page (the tool's site).
      if (e.source !== frame.current?.contentWindow) return
      if (e.origin === storageOrigin) {
        const reply = storageReply(store.current, e.origin, e.data)
        if (reply && e.source) (e.source as Window).postMessage(reply, e.origin)
      }
      if (e.origin !== frameOrigin) return
      if (typeof e.data !== 'object' || e.data === null) return
      const msg = e.data as { subject?: unknown; height?: unknown }
      if (msg.subject === 'id.checkpoint.answered') void sync()
      if (msg.subject === 'id.checkpoint.resize' && typeof msg.height === 'number')
        setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(msg.height) + 8)))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [launch, sync])

  // Once the frame is on the page, post the launch into it.
  useEffect(() => {
    if (launch) submitLaunchForm(launch.action, launch.fields, frameName)
  }, [launch, frameName])

  const open = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setLaunch(await send<Launch>('POST', `${base}/tool-launch`, { embed: true }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }, [base, send])

  const closeChanges = useCallback(() => setChanges(null), [])

  const s = state.data
  const askIntake = !!s && s.diagnostic && s.intake === null && !s.completed
  useEffect(() => {
    if (s && !askIntake && !launch && !busy && !error) void open()
  }, [s, askIntake, launch, busy, error, open])

  async function intake(level: IntakeLevel, fresh: boolean) {
    setBusy(true)
    setError(null)
    try {
      await send('POST', `${base}/adaptive/intake`, { level, fresh })
      if (fresh) window.location.assign(href(`/lms/learning/${item.cohortId}`))
      else state.reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!item.tool)
    return (
      <article className="dash-card dash-lesson">
        <p>This activity is not available right now. Tell your instructor.</p>
      </article>
    )
  if (state.error) return <p className="dash-error">{state.error.message}</p>
  if (!s) return <p className="dash-loading">Loading…</p>

  return (
    <div className="ad ad-embed">
      {askIntake ? (
        <Intake busy={busy} onPick={(level, fresh) => void intake(level, fresh)} />
      ) : (
        <iframe
          ref={frame}
          name={frameName}
          title={item.title}
          className="ad-embed-frame"
          style={{ height }}
          allow="clipboard-write"
        />
      )}
      {error && (
        <p className="dash-error" role="alert">
          {error}{' '}
          <button type="button" className="dash-btn-quiet" onClick={() => void open()}>
            Try again
          </button>
        </p>
      )}
      {completed && (
        // The answers may have changed the path, so what comes next is read from the course page.
        <p className="ad-embed-next">
          <a className="dash-btn" href={href(`/lms/learning/${item.cohortId}`)}>
            See what is next on your path →
          </a>
        </p>
      )}
      {changes && (
        <PlanChangeOverlay
          result={changes}
          courseHref={href(`/lms/learning/${item.cohortId}`)}
          onClose={closeChanges}
        />
      )}
    </div>
  )
}

/** Before a diagnostic: what the learner says about themselves, which picks the kind of help they get. */
function Intake({
  busy,
  onPick,
}: {
  busy: boolean
  onPick: (level: IntakeLevel, fresh: boolean) => void
}) {
  const [never, setNever] = useState(false)
  return (
    <section className="dash-card ad-intake" aria-labelledby="h-intake">
      <h2 className="dash-card-title" id="h-intake">
        Before you start: how much SQL have you written?
      </h2>
      <p className="dash-muted">
        This diagnostic finds what you can already do, so you can skip it. It is not graded and
        nobody fails it.
      </p>
      {!never ? (
        <div className="ad-intake-options">
          <button
            type="button"
            className="dash-btn-secondary"
            disabled={busy}
            onClick={() => setNever(true)}
          >
            Never
          </button>
          <button
            type="button"
            className="dash-btn-secondary"
            disabled={busy}
            onClick={() => onPick('some', false)}
          >
            A little
          </button>
          <button
            type="button"
            className="dash-btn-secondary"
            disabled={busy}
            onClick={() => onPick('regular', false)}
          >
            I use it regularly
          </button>
        </div>
      ) : (
        <div className="ad-intake-options">
          <button
            type="button"
            className="dash-btn"
            disabled={busy}
            onClick={() => onPick('never', true)}
          >
            Start from the beginning
          </button>
          <button
            type="button"
            className="dash-btn-secondary"
            disabled={busy}
            onClick={() => onPick('never', false)}
          >
            Try the diagnostic anyway
          </button>
        </div>
      )}
    </section>
  )
}
