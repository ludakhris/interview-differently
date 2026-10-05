import type { LearnerCohortCard } from '@id/types'
import { useState, type FormEvent } from 'react'
import { useApiSend, useLoad } from './api'
import { useApp } from './app-context'
import { Meter } from './charts'
import { CohortStatusChip } from './CohortsPage'
import { dateShort } from './format'
import { errorNotice } from './shared'

/** The learner's home: the cohorts they are in, and a box to join another with a code. */
export function LearningPage() {
  const { href } = useApp()
  const { data, error, loading, reload } = useLoad<LearnerCohortCard[]>('/learn/me/learning')
  const send = useApiSend()
  const [busy, setBusy] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  async function join(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const code = String(new FormData(form).get('code') ?? '')
    setBusy(true)
    setJoinError(null)
    try {
      const card = await send<LearnerCohortCard>('POST', '/learn/me/join', { code })
      window.location.assign(href(`/learning/${card.cohortId}`))
    } catch (err) {
      setJoinError((err as Error).message)
      setBusy(false)
      reload()
    }
  }

  if (error) return errorNotice(error)
  if (loading || !data) return <p className="dash-loading">Loading your learning…</p>

  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">My learning</h1>
          <p className="dash-sub">
            Your courses, your progress and your readiness record, in one place.
          </p>
        </div>
      </div>

      <form className="dash-card dash-joinform" onSubmit={join}>
        <label className="dash-field">
          <span>Have a join code?</span>
          <input
            name="code"
            required
            maxLength={40}
            placeholder="Enter the code from your instructor"
            autoComplete="off"
          />
        </label>
        <button type="submit" className="dash-btn" disabled={busy}>
          {busy ? 'Joining…' : 'Join cohort'}
        </button>
        {joinError && <p className="dash-error dash-joinform-error">{joinError}</p>}
      </form>

      {data.length === 0 ? (
        <div className="dash-empty">
          <h2 className="dash-card-title">You have not joined a cohort yet</h2>
          <p>Enter the join code your instructor or training provider gave you.</p>
        </div>
      ) : (
        <ul className="dash-courselist">
          {data.map((c) => (
            <li key={c.cohortId} className="dash-card dash-course">
              <div className="dash-course-main">
                <a className="dash-course-title" href={href(`/learning/${c.cohortId}`)}>
                  {c.courseTitle}
                </a>
                <p className="dash-sub">
                  {c.cohortName} · {c.host} · {dateShort(c.startsAt)} to {dateShort(c.endsAt)}
                </p>
              </div>
              <div className="dash-learner-progress">
                <Meter value={c.itemsTotal ? c.itemsDone / c.itemsTotal : null} label="Progress" />
                <span className="dash-muted">
                  {c.itemsDone} of {c.itemsTotal} done
                </span>
              </div>
              <div className="dash-course-side">
                <CohortStatusChip status={c.status} />
                {c.enrollmentStatus === 'completed' && (
                  <span className="dash-chip dash-chip-on">Completed</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
