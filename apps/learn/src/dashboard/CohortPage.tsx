import type { CohortDetail } from '@id/types'
import { Fragment, useEffect, useState, type FormEvent } from 'react'
import { useApiFetch, useApiSend, useLoad } from './api'
import { useApp } from './app-context'
import { AttemptsPanel } from './AttemptsPanel'
import { AttendancePanel } from './attendance/AttendancePanel'
import { Meter } from './charts'
import { CohortConfigModal } from './CohortConfigModal'
import { CohortStatusChip } from './CohortsPage'
import { dateOnly, dateShort } from './format'
import type { PendingJoinRequest } from './joinRequests'
import { errorNotice } from './shared'

/** People who joined with the code on an approval cohort, waiting for Approve or Decline. */
export function PendingRequests({
  cohortId,
  onApproved,
}: {
  cohortId: string
  onApproved: () => void
}) {
  const send = useApiSend()
  const { data } = useLoad<PendingJoinRequest[]>(`/learn/cohorts/${cohortId}/join-requests`)
  const [gone, setGone] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const rows = (data ?? []).filter((r) => !gone.includes(r.id))
  if (rows.length === 0 && !message) return null

  async function decide(r: PendingJoinRequest, action: 'approve' | 'decline') {
    setBusy(true)
    setMessage(null)
    try {
      await send('POST', `/learn/join-requests/${r.id}/${action}`)
      setGone((g) => [...g, r.id])
      setMessage({
        kind: 'ok',
        text: action === 'approve' ? `${r.name} approved.` : `${r.name} declined.`,
      })
      if (action === 'approve') onApproved()
    } catch (err) {
      const text = (err as Error).message
      setMessage({ kind: 'error', text: /full/i.test(text) ? 'This cohort is full.' : text })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dash-pending">
      {rows.length > 0 && (
        <>
          <h3 className="dash-card-title">Waiting for approval ({rows.length})</h3>
          <ul className="dash-pending-list">
            {rows.map((r) => (
              <li key={r.id}>
                <span>
                  {r.name} <span className="dash-muted">{r.email ?? ''}</span>{' '}
                  <span className="dash-muted">requested {dateShort(r.requestedAt)}</span>
                </span>
                <span className="dash-pending-actions">
                  <button
                    type="button"
                    className="dash-btn-secondary"
                    disabled={busy}
                    onClick={() => void decide(r, 'approve')}
                  >
                    Approve
                  </button>{' '}
                  <button
                    type="button"
                    className="dash-btn-quiet"
                    disabled={busy}
                    onClick={() => void decide(r, 'decline')}
                  >
                    Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className={message?.kind === 'error' ? 'dash-error' : 'dash-muted'} role="status">
        {message?.text}
      </p>
    </div>
  )
}

export function CohortPage({ cohortId }: { cohortId: string }) {
  const { data, error, loading } = useLoad<CohortDetail>(`/learn/cohorts/${cohortId}`)
  const [cohort, setCohort] = useState<CohortDetail | null>(null)
  useEffect(() => {
    if (data) setCohort(data)
  }, [data])
  if (error) return errorNotice(error)
  if (loading || !cohort) return <p className="dash-loading">Loading cohort…</p>
  return <Cohort cohort={cohort} onChange={setCohort} />
}

const STATUS_LABEL = {
  enrolled: 'Enrolled',
  completed: 'Completed',
  withdrawn: 'Withdrawn',
} as const

function Cohort({
  cohort,
  onChange,
}: {
  cohort: CohortDetail
  onChange: (c: CohortDetail) => void
}) {
  const { href } = useApp()
  const send = useApiSend()
  const apiFetch = useApiFetch()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [attemptsFor, setAttemptsFor] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)

  async function run(action: () => Promise<CohortDetail>, ok?: string): Promise<boolean> {
    setBusy(true)
    setMessage(null)
    try {
      onChange(await action())
      if (ok) setMessage({ kind: 'ok', text: ok })
      return true
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message })
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addLearner(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const email = String(new FormData(form).get('email') ?? '')
    if (
      await run(
        () => send<CohortDetail>('POST', `/learn/cohorts/${cohort.id}/learners`, { email }),
        'Learner added.'
      )
    ) {
      form.reset()
    }
  }

  /** Re-applies the completion rules to one learner, e.g. after the rules or the course changed. */
  async function recompute(id: string, name: string) {
    setBusy(true)
    setMessage(null)
    try {
      const out = await send<{ change: string | null; cohort: CohortDetail }>(
        'POST',
        `/learn/enrollments/${id}/recompute`
      )
      onChange(out.cohort)
      const text: Record<string, string> = {
        completed: `${name} meets the completion rules and is now marked completed.`,
        reopened: `${name} no longer meets the completion rules, so their course is open again.`,
        date: `${name}'s completion date was corrected.`,
      }
      setMessage({
        kind: 'ok',
        text: text[out.change ?? ''] ?? `${name}'s record is already up to date.`,
      })
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const withdraw = (id: string, name: string) => {
    if (window.confirm(`Withdraw ${name} from this cohort? Their results are kept.`)) {
      void run(() => send<CohortDetail>('DELETE', `/learn/enrollments/${id}`), `${name} withdrawn.`)
    }
  }

  async function copyCode() {
    if (!cohort.joinKey) return
    try {
      await navigator.clipboard.writeText(cohort.joinKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked: the code is on screen to copy by hand */
    }
  }

  async function refetchRoster() {
    try {
      onChange((await (await apiFetch(`/learn/cohorts/${cohort.id}`)).json()) as CohortDetail)
    } catch {
      /* the roster refreshes on the next visit */
    }
  }

  return (
    <>
      <p className="dash-back">
        <a href={href('/lms/cohorts')}>← All cohorts</a>
      </p>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">{cohort.name}</h1>
          <p className="dash-sub">
            {cohort.courseTitle} · {dateOnly(cohort.startsAt)} to {dateOnly(cohort.endsAt)}
            {cohort.lengthWeeks ? ` (${cohort.lengthWeeks} weeks)` : ''}
          </p>
        </div>
        <div className="dash-cohort-actions">
          <a
            className="dash-btn-secondary dash-btn-link"
            href={href(`/lms/activity/${encodeURIComponent(cohort.id)}`)}
          >
            Activity
          </a>
          <button
            type="button"
            className="dash-btn-secondary dash-btn-icon"
            onClick={() => setConfigOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-2.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V19a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H5a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H11a1.7 1.7 0 0 0 1-1.5V5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V11a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
              />
            </svg>
            Edit cohort configuration
          </button>
          <CohortStatusChip status={cohort.status} />
        </div>
      </div>

      {message && (
        <p
          className={message.kind === 'error' ? 'dash-banner dash-banner-error' : 'dash-banner'}
          role="status"
        >
          {message.text}
        </p>
      )}

      <section className="dash-card dash-joincode" aria-labelledby="h-code">
        <div>
          <h2 className="dash-card-title" id="h-code">
            Join code
          </h2>
          <p className="dash-sub">Share this with learners. They sign in and enter it to join.</p>
        </div>
        <div className="dash-joincode-box">
          <span className="dash-code dash-code-big">{cohort.joinKey ?? '—'}</span>
          <button type="button" className="dash-btn-secondary" onClick={copyCode}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </section>

      {cohort.delivery !== 'online' && <AttendancePanel cohortId={cohort.id} />}

      <section className="dash-section" aria-labelledby="h-roster">
        <div className="dash-head">
          <div>
            <h2 className="dash-h2" id="h-roster">
              Roster
            </h2>
            <p className="dash-sub">
              {cohort.maxLearners !== null
                ? `${cohort.enrolled} of ${cohort.maxLearners} places taken`
                : `${cohort.enrolled} ${cohort.enrolled === 1 ? 'learner' : 'learners'}`}
            </p>
          </div>
        </div>

        <PendingRequests cohortId={cohort.id} onApproved={() => void refetchRoster()} />

        <form className="dash-inline-form" onSubmit={addLearner}>
          <label className="dash-field">
            <span>Add a learner by email</span>
            <input name="email" type="email" required placeholder="name@example.com" />
          </label>
          <button type="submit" className="dash-btn-secondary" disabled={busy}>
            Add learner
          </button>
        </form>
        <p className="dash-muted dash-hint">
          Only people who have already signed in can be added by email. Everyone else joins with the
          code.
        </p>

        {cohort.roster.length === 0 ? (
          <div className="dash-empty">
            <h3 className="dash-card-title">No learners yet</h3>
            <p>Share the join code above, or add someone by email.</p>
          </div>
        ) : (
          <div className="dash-tablewrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th scope="col">Learner</th>
                  <th scope="col">Email</th>
                  <th scope="col">Status</th>
                  <th scope="col">Course progress</th>
                  <th scope="col">Joined</th>
                  <th scope="col">
                    <span className="dash-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {cohort.roster.map((r) => (
                  <Fragment key={r.enrollmentId}>
                    <tr>
                      <th scope="row">
                        <a
                          href={href(
                            `/lms/cohorts/${encodeURIComponent(cohort.id)}/learners/${encodeURIComponent(r.userId)}`
                          )}
                        >
                          {r.name}
                        </a>
                      </th>
                      <td>{r.email ?? '—'}</td>
                      <td>{STATUS_LABEL[r.status]}</td>
                      <td>
                        <Meter
                          value={r.itemsTotal ? r.itemsDone / r.itemsTotal : null}
                          label="Course progress"
                        />
                      </td>
                      <td>{dateShort(r.enrolledAt)}</td>
                      <td>
                        {r.status !== 'withdrawn' && (
                          <>
                            <button
                              type="button"
                              className="dash-btn-quiet"
                              aria-expanded={attemptsFor === r.enrollmentId}
                              title="Each recorded attempt at a connected-tool item"
                              onClick={() =>
                                setAttemptsFor(
                                  attemptsFor === r.enrollmentId ? null : r.enrollmentId
                                )
                              }
                            >
                              Attempts
                            </button>{' '}
                            <button
                              type="button"
                              className="dash-btn-quiet"
                              disabled={busy}
                              title="Check this learner's course status and completion date against the current rules"
                              onClick={() => void recompute(r.enrollmentId, r.name)}
                            >
                              Recompute
                            </button>{' '}
                            <button
                              type="button"
                              className="dash-btn-quiet"
                              disabled={busy}
                              onClick={() => withdraw(r.enrollmentId, r.name)}
                            >
                              Withdraw
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                    {attemptsFor === r.enrollmentId && (
                      <tr className="dash-attempts-row">
                        <td colSpan={6}>
                          <AttemptsPanel
                            courseId={cohort.courseId}
                            enrollmentId={r.enrollmentId}
                            name={r.name}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {configOpen && (
        <CohortConfigModal
          cohort={cohort}
          onClose={() => setConfigOpen(false)}
          onSaved={(c) => {
            onChange(c)
            setConfigOpen(false)
            setMessage({ kind: 'ok', text: 'Saved.' })
          }}
        />
      )}
    </>
  )
}
