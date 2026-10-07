import { useState } from 'react'
import {
  COLLAPSED_COUNT,
  attemptWhen,
  earlierNote,
  passedText,
  visibleAttempts,
  type AttemptLogEntry,
} from './attemptsText'
import { score } from './format'

/** The attempts, newest first, with a Best chip and the pass-mark wording. Shared by the learner and staff views. */
export function AttemptsList(props: {
  attempts: AttemptLogEntry[]
  attemptsBeforeLog?: number
  viewer?: 'learner' | 'staff'
}) {
  const { attempts, viewer = 'learner' } = props
  const [showAll, setShowAll] = useState(false)
  const shown = visibleAttempts(attempts, showAll)
  const note = earlierNote(props.attemptsBeforeLog ?? 0, viewer)
  return (
    <>
      {attempts.length > 0 && (
        <ul className="dash-attempts">
          {shown.map((a, i) => {
            const verdict = passedText(a.passed)
            return (
              <li key={`${a.at}-${i}`} className="dash-attempt">
                <span className="dash-attempt-when">{attemptWhen(a.at)}</span>
                <strong className="dash-attempt-score">{score(a.score)}</strong>
                {a.best && <span className="dash-chip dash-chip-on dash-attempt-chip">Best</span>}
                {verdict && <span className="dash-muted">{verdict}</span>}
              </li>
            )
          })}
        </ul>
      )}
      {attempts.length > COLLAPSED_COUNT && (
        <button
          type="button"
          className="dash-btn-quiet"
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? 'Show fewer' : `Show all ${attempts.length}`}
        </button>
      )}
      {note && <p className="dash-muted dash-attempts-note">{note}</p>}
    </>
  )
}

/**
 * The learner's own section on the result screen: closed until opened, so the times do not crowd
 * the score card. Renders nothing when there is nothing to show.
 */
export function YourAttempts(props: { attempts?: AttemptLogEntry[]; attemptsBeforeLog?: number }) {
  const log = props.attempts ?? []
  const before = props.attemptsBeforeLog ?? 0
  if (log.length === 0 && !(before > 0)) return null
  return (
    <details className="dash-attempts-section">
      <summary className="dash-attempts-title">Your attempts ({log.length + before})</summary>
      <AttemptsList attempts={log} attemptsBeforeLog={before} />
    </details>
  )
}

/** Staff view of one learner's attempts at one item, fetched by the caller. */
export function StaffAttempts(props: {
  state: {
    loading: boolean
    error: Error | null
    data: { attempts: AttemptLogEntry[]; attemptsBeforeLog?: number } | null
  }
  onRetry: () => void
}) {
  const { loading, error, data } = props.state
  if (loading) return <p className="dash-loading">Loading attempts…</p>
  if (error) {
    return (
      <div role="alert">
        <p className="dash-error">Could not load the attempts: {error.message}</p>
        <button type="button" className="dash-btn-quiet" onClick={props.onRetry}>
          Try again
        </button>
      </div>
    )
  }
  if (!data || (data.attempts.length === 0 && !((data.attemptsBeforeLog ?? 0) > 0))) {
    return <p className="dash-muted">No attempts recorded for this item.</p>
  }
  return (
    <AttemptsList
      attempts={data.attempts}
      attemptsBeforeLog={data.attemptsBeforeLog}
      viewer="staff"
    />
  )
}
