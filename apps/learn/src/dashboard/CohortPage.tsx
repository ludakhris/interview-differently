import type { CohortDetail } from '@id/types'
import { useEffect, useState, type FormEvent } from 'react'
import { useApiSend, useLoad } from './api'
import { useApp } from './app-context'
import { Meter } from './charts'
import { CohortStatusChip } from './CohortsPage'
import { dateOnly, dateShort } from './format'
import { errorNotice } from './shared'

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
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [copied, setCopied] = useState(false)

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

  async function saveDetails(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const limit = String(f.get('maxLearners') ?? '').trim()
    const body: Record<string, unknown> = {
      name: f.get('name'),
      maxLearners: limit ? Number(limit) : null,
    }
    if (f.get('startsAt')) body.startsAt = f.get('startsAt')
    await run(() => send<CohortDetail>('PUT', `/learn/cohorts/${cohort.id}`, body), 'Saved.')
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

  const upcoming = cohort.status === 'upcoming'
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
        <CohortStatusChip status={cohort.status} />
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
                  <tr key={r.enrollmentId}>
                    <th scope="row">{r.name}</th>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dash-card" aria-labelledby="h-details">
        <h2 className="dash-card-title" id="h-details">
          Cohort details
        </h2>
        <form className="dash-form" onSubmit={saveDetails} key={cohort.name + cohort.startsAt}>
          <div className="dash-field-row">
            <label className="dash-field">
              <span>Name</span>
              <input name="name" required maxLength={120} defaultValue={cohort.name} />
            </label>
            <label className="dash-field">
              <span>Start date</span>
              <input
                name="startsAt"
                type="date"
                disabled={!upcoming}
                defaultValue={cohort.startsAt?.slice(0, 10) ?? ''}
              />
              {!upcoming && (
                <small className="dash-muted">
                  The start date can only change before the cohort starts.
                </small>
              )}
            </label>
            <label className="dash-field">
              <span>End date</span>
              <input type="text" readOnly disabled value={dateOnly(cohort.endsAt)} />
              <small className="dash-muted">Follows the start date and the course length.</small>
            </label>
            <label className="dash-field">
              <span>Maximum learners</span>
              <input
                name="maxLearners"
                type="number"
                min={1}
                max={5000}
                defaultValue={cohort.maxLearners ?? ''}
                placeholder="No limit"
              />
              <small className="dash-muted">Blank means no limit.</small>
            </label>
          </div>
          <div className="dash-form-actions">
            <button type="submit" className="dash-btn" disabled={busy}>
              Save details
            </button>
          </div>
        </form>
      </section>
    </>
  )
}
