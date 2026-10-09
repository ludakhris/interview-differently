import type { AssessmentStatus, AssessmentStatusItem } from '@id/types'
import { useState } from 'react'
import { useApiSend, useLoad } from './api'
import { attemptWhen } from './attemptsText'
import { score } from './format'
import { submitLaunchForm } from './launchForm'

const STATUS_WORDS = {
  not_started: 'Not started',
  in_progress: 'Opened, no score yet',
  submitted: 'Submitted',
} as const

/**
 * Staff: who has opened, who is partway and who has submitted each assessment of this cohort's
 * course. Manual refresh, like the Simulator's own live view. Built from what the course records,
 * so it says "opened" and not how many questions are answered; that stays in the Simulator.
 */
export function AssessmentStatusPanel({ cohortId }: { cohortId: string }) {
  const { data, error, loading, reload } = useLoad<AssessmentStatus>(
    `/learn/cohorts/${cohortId}/assessment-status`
  )
  if (loading && !data) return <p className="dash-loading">Loading assessments…</p>
  if (error && !data) return null // a status panel never blocks the roster below it
  if (!data || data.items.length === 0) return null
  return (
    <section className="dash-section" aria-labelledby="h-assessments">
      <div className="dash-head">
        <div>
          <h2 className="dash-h2" id="h-assessments">
            Assessments
          </h2>
          <p className="dash-sub">
            Who has opened and submitted each assessment. Refresh to see the latest.
          </p>
        </div>
        <button type="button" className="dash-btn-secondary" onClick={reload} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {data.items.map((item) => (
        <AssessmentStatusTable key={item.itemId} item={item} />
      ))}
      <p className="dash-muted dash-hint">
        Updated {attemptWhen(data.generatedAt)}. "Opened" means the learner started the assessment
        and no score has come back yet. Open a learner's answers once they have submitted.
      </p>
    </section>
  )
}

function AssessmentStatusTable({ item }: { item: AssessmentStatusItem }) {
  const send = useApiSend()
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function viewAnswers(enrollmentId: string) {
    setOpening(enrollmentId)
    setError(null)
    try {
      const out = await send<{ action: string; fields: Record<string, string> }>(
        'POST',
        `/learn/enrollments/${enrollmentId}/review-launch`,
        { itemId: item.itemId }
      )
      submitLaunchForm(out.action, out.fields)
    } catch (err) {
      setError((err as Error).message)
      setOpening(null)
    }
  }

  const { notStarted, inProgress, submitted } = item.counts
  return (
    <div className="dash-card">
      <h3 className="dash-card-title">
        {item.title} {item.label && <span className="dash-chip">{item.label}</span>}
      </h3>
      <p className="dash-muted">
        {submitted} submitted · {inProgress} opened · {notStarted} not started
      </p>
      {error && <p className="dash-error">{error}</p>}
      <div className="dash-tablewrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th scope="col">Learner</th>
              <th scope="col">Status</th>
              <th scope="col">Best score</th>
              <th scope="col">Last opened</th>
              <th scope="col">
                <span className="dash-visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {item.learners.map((l) => (
              <tr key={l.enrollmentId}>
                <td>{l.name}</td>
                <td>{STATUS_WORDS[l.status]}</td>
                <td className="num">{l.score === null ? '—' : score(l.score)}</td>
                <td>{l.openedAt ? attemptWhen(l.openedAt) : '—'}</td>
                <td>
                  {l.attempts > 0 && (
                    <button
                      type="button"
                      className="dash-btn-quiet"
                      disabled={opening !== null}
                      onClick={() => void viewAnswers(l.enrollmentId)}
                    >
                      {opening === l.enrollmentId ? 'Opening…' : 'View answers'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
