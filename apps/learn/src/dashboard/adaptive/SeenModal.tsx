import type { LearnerSeen, SeenEntry } from '@id/types'
import { Fragment, useEffect, useLayoutEffect, useRef } from 'react'
import { useLoad } from '../api'

const POLL_MS = 2500

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
  const { data, error, reload } = useLoad<LearnerSeen>(
    `/learn/cohorts/${encodeURIComponent(cohortId)}/adaptive/learners/${encodeURIComponent(enrollmentId)}/seen`
  )
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
                  <Entry entry={e} first={first} />
                </li>
              </Fragment>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

function Entry({ entry: e, first }: { entry: SeenEntry; first: string }) {
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
          {/* The lesson as a storyboard: Spark's player lives in Spark; staff read what was said and shown. */}
          <h4 className="ad-seen-video-title">{e.title}</h4>
          <ol className="ad-seen-scenes">
            {e.scenes.map((sc, i) => (
              <li key={i}>
                <strong>{sc.heading}</strong> {sc.narration}
              </li>
            ))}
          </ol>
        </div>
      )
  }
}
