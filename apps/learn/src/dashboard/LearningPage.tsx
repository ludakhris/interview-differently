import type { LearnerCohortCard, LearnerProfileState } from '@id/types'
import { useState, type FormEvent } from 'react'
import { useApiSend, useLoad } from './api'
import { useApp } from './app-context'
import { Meter } from './charts'
import { CohortStatusChip } from './CohortsPage'
import { dateOnly } from './format'
import {
  isPendingJoin,
  requestContact,
  requestSentLine,
  requestState,
  requestTitle,
  type LearnerJoinRequest,
} from './joinRequests'
import { errorNotice } from './shared'

/** Requests still waiting for an admin, or not approved: one small line each, nothing when none. */
export function JoinRequestList({ requests }: { requests: LearnerJoinRequest[] }) {
  if (requests.length === 0) return null
  return (
    <ul className="dash-joinrequests" aria-label="Join requests">
      {requests.map((r) => {
        const contact = requestContact(r)
        return (
          <li key={r.id}>
            {requestTitle(r)} —{' '}
            <span className={r.status === 'declined' ? 'dash-muted' : undefined}>
              {requestState(r)}
            </span>
            {contact && <> · {contact}</>}
          </li>
        )
      })}
    </ul>
  )
}

/** The learner's home: the cohorts they are in, and a box to join another with a code. */
export function LearningPage() {
  const { href } = useApp()
  const { data, error, loading, reload } = useLoad<LearnerCohortCard[]>('/learn/me/learning')
  const requests = useLoad<LearnerJoinRequest[]>('/learn/me/join-requests')
  const profile = useLoad<LearnerProfileState>('/learn/me/profile')
  const profileDue = (profile.data?.requirements ?? []).some((r) => !r.satisfied)
  const send = useApiSend()
  const [sent, setSent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  async function join(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const code = String(new FormData(form).get('code') ?? '')
    setBusy(true)
    setJoinError(null)
    setSent(null)
    try {
      const out = await send<LearnerCohortCard | { pending: true; request: LearnerJoinRequest }>(
        'POST',
        '/learn/me/join',
        { code }
      )
      if (isPendingJoin(out)) {
        setSent(requestSentLine(out.request.contact))
        setBusy(false)
        form.reset()
        requests.reload()
        return
      }
      const card = out
      window.location.assign(href(`/lms/learning/${card.cohortId}`))
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
          <p className="dash-sub">
            <a href={href('/lms/learning/outcomes')}>My outcomes</a> ·{' '}
            <a href={href('/lms/learning/profile')}>My profile</a>
          </p>
        </div>
      </div>

      {profileDue && (
        <p className="dash-banner" data-testid="profile-due">
          <a href={href('/lms/learning/profile')}>Your profile</a>:{' '}
          {profile.data?.profile.complete ? 'Time to refresh your profile' : 'Finish your profile'}
        </p>
      )}

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
        {sent && (
          <p className="dash-muted dash-joinform-error" role="status">
            {sent}
          </p>
        )}
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
                <a className="dash-course-title" href={href(`/lms/learning/${c.cohortId}`)}>
                  {c.courseTitle}
                </a>
                <p className="dash-sub">
                  {c.cohortName} · {c.host} · {dateOnly(c.startsAt)} to {dateOnly(c.endsAt)}
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

      <JoinRequestList requests={requests.data ?? []} />
    </>
  )
}
