import type { LearnerSeen, SeenEntry } from '@id/types'
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLoad } from '../api'

const POLL_MS = 2500
const MIN_HEIGHT = 420
const MAX_HEIGHT = 1600
// Spark's preview links last an hour (PREVIEW_TTL_S in the API); warn a minute early, since the link was signed first.
export const LINK_EXPIRES_MS = 59 * 60 * 1000

const HELP_NAME = { hint: 'Hint', explain: 'Another explanation', example: 'Worked example' }

const initials = (who: string) =>
  who
    .split(/[\s·]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')

/**
 * What one learner saw, replayed in order (adaptive checkpoints prototype): each colleague's request and what they
 * answered, every hint shown, the videos made for them (playable) and their practice. Staff only; read only.
 * Live: it refreshes while open, new entries pop in, and it follows the newest unless you have scrolled up.
 */
export function SeenModal({
  cohortId,
  enrollmentId,
  onClose,
}: {
  cohortId: string
  enrollmentId: string
  onClose: () => void
}) {
  const seenPath = `/learn/cohorts/${encodeURIComponent(cohortId)}/adaptive/learners/${encodeURIComponent(enrollmentId)}/seen`
  const { data, error, reload } = useLoad<LearnerSeen>(seenPath)
  const close = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  useEffect(() => {
    const t = window.setInterval(() => reloadRef.current(), POLL_MS)
    return () => window.clearInterval(t)
  }, [])
  // Which entries are new since the last refresh, and whether to follow them to the bottom.
  const shown = useRef<number | null>(null)
  const following = useRef(true)
  const count = data?.entries.length ?? 0
  const fresh = shown.current === null ? count : shown.current
  useLayoutEffect(() => {
    if (!data) return
    const grew = shown.current !== null && count > shown.current
    shown.current = count
    const el = card.current
    if (grew && el && following.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [data, count])
  useEffect(() => {
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const first = data?.name.split(' ')[0] ?? 'The learner'

  return (
    <div
      className="ad-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="h-seen"
      onClick={onClose}
    >
      <div
        ref={card}
        className="ad ad-overlay-card ad-seen"
        onClick={(e) => e.stopPropagation()}
        onScroll={(e) => {
          const el = e.currentTarget
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160
        }}
      >
        <div className="ad-seen-head">
          <h2 id="h-seen">What {data?.name ?? '…'} saw</h2>
          <span className="ad-live" aria-label="Updates live">
            Live
          </span>
          <button ref={close} type="button" className="dash-btn-quiet" onClick={onClose}>
            Close
          </button>
        </div>
        {error && <p className="dash-error">{error.message}</p>}
        {!data && !error && <p className="dash-loading">Loading…</p>}
        {data && data.entries.length === 0 && (
          <p className="dash-muted">{first} has not started yet.</p>
        )}
        {data && (
          <ol className="ad-seen-feed">
            {data.entries.map((e, i) => (
              <Fragment key={`${e.at}-${i}`}>
                {(i === 0 || data.entries[i - 1].item !== e.item) && (
                  <li className="ad-seen-item">{e.item}</li>
                )}
                <li className={i >= fresh ? 'ad-seen-new' : undefined}>
                  <Entry entry={e} first={first} seenPath={seenPath} />
                </li>
              </Fragment>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

function Entry({
  entry: e,
  first,
  seenPath,
}: {
  entry: SeenEntry
  first: string
  seenPath: string
}) {
  switch (e.kind) {
    case 'request':
      return (
        <div className="ad-turn">
          <div className="ad-bubble">
            <span className="ad-bubble-avatar" aria-hidden="true">
              {initials(e.from ?? 'Task')}
            </span>
            <div>
              <span className="ad-bubble-who">{e.from ?? 'Request'}</span>
              <p>{e.prompt}</p>
            </div>
          </div>
          <div className="ad-bubble is-mine">
            <div>
              <span className="ad-bubble-who">{first}</span>
              {e.passed ? (
                <p>Not learned this yet: passed</p>
              ) : (
                <pre className="ad-seen-sql">{e.sql}</pre>
              )}
            </div>
          </div>
          {!e.passed && (
            <span className={`ad-chip ${e.correct ? 'ad-chip-add' : 'ad-chip-gap'} ad-seen-result`}>
              {e.correct ? '✓ Right' : `✗ ${e.reason ?? 'Not quite'}`}
            </span>
          )}
        </div>
      )
    case 'help':
      return (
        <div className="ad-help">
          <span className="ad-help-source">From the AI coach · {HELP_NAME[e.helpKind]}</span>
          <p>{e.text}</p>
          {e.exampleSql && <pre>{e.exampleSql}</pre>}
        </div>
      )
    case 'practice':
      return (
        <div className="ad-generated">
          <span className="ad-chip ad-chip-ai">Practice written for {first}</span>
          <p>{e.intro}</p>
          <ol className="ad-seen-tasks">
            {e.tasks.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </div>
      )
    case 'video':
      return (
        <div className="ad-seen-video">
          <span className="ad-chip ad-chip-ai">
            Video made for {first} · {e.watched ? `watched ${e.watched}` : 'not opened yet'}
          </span>
          <h4 className="ad-seen-video-title">{e.title}</h4>
          <SeenVideo
            path={`${seenPath}/lessons/${encodeURIComponent(e.lessonId)}/watch`}
            entry={e}
          />
        </div>
      )
  }
}

/**
 * The video itself, in Spark's player with a link that records nothing (Spark's player lives in Spark, so it is framed
 * here, not imported). Asked for once per entry, so the live refresh does not restart it. If the link cannot be had,
 * staff read the storyboard instead.
 */
function SeenVideo({
  path,
  entry: e,
}: {
  path: string
  entry: Extract<SeenEntry, { kind: 'video' }>
}) {
  const { data, error } = useLoad<{ url: string }>(path)
  const [height, setHeight] = useState(MIN_HEIGHT)
  const [expired, setExpired] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const url = data?.url
  useEffect(() => {
    if (!url) return
    const t = window.setTimeout(() => setExpired(true), LINK_EXPIRES_MS)
    return () => window.clearTimeout(t)
  }, [url])
  const playerOrigin = data?.url ? new URL(data.url).origin : null
  useEffect(() => {
    if (!playerOrigin) return
    const onMessage = (m: MessageEvent) => {
      if (m.origin !== playerOrigin || m.source !== frame.current?.contentWindow) return
      const msg = m.data as { subject?: unknown; height?: unknown } | null
      if (msg?.subject === 'spark.lesson.resize' && typeof msg.height === 'number')
        setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(msg.height) + 8)))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [playerOrigin])

  if (data)
    return (
      <>
        {expired && (
          <p className="dash-error" role="status">
            This video’s link has expired after an hour open. Close and reopen this view to play it
            again.
          </p>
        )}
        <iframe
          ref={frame}
          src={data.url}
          title={e.title}
          className="ad-embed-frame"
          style={{ height }}
          allow="autoplay"
        />
      </>
    )
  if (!error) return <p className="dash-loading">Loading the video…</p>
  return (
    <>
      <p className="dash-muted">The video could not be loaded here; this is what it says.</p>
      <ol className="ad-seen-scenes">
        {e.scenes.map((sc, i) => (
          <li key={i}>
            <strong>{sc.heading}</strong> {sc.narration}
          </li>
        ))}
      </ol>
    </>
  )
}
