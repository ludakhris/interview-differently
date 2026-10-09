import type { AssessmentResults, AssessmentSummary, AssessmentSummaryRow } from '@id/types'
import { useState } from 'react'
import { downloadFile, useApiFetch, useApiSend, useLoad } from '../api'
import { useApp } from '../app-context'
import { Modal } from '../Modal'
import { submitLaunchForm } from '../launchForm'
import {
  STATUS_WORDS,
  changeText,
  fileSlug,
  improvementDetail,
  minutesText,
  percentText,
  sectionText,
} from './assessmentsLogic'
import './assessments.css'

/**
 * The cohort's Assessments: one row per assessment of the course with its stats, and the same
 * three actions on every row as attendance has: Live monitor, View results, Download CSV.
 * Reload the page for fresh numbers; the live monitor is the live view.
 */
export function AssessmentsSection({ cohortId }: { cohortId: string }) {
  const { href, query } = useApp()
  const apiFetch = useApiFetch()
  const base = `/learn/cohorts/${encodeURIComponent(cohortId)}`
  const { data, error, loading } = useLoad<AssessmentSummary>(`${base}/assessments`)
  const [viewing, setViewing] = useState<AssessmentSummaryRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (loading && !data) return <p className="dash-loading">Loading assessments…</p>
  if (error && !data) return null // never blocks the roster below it
  if (!data || data.items.length === 0) return null

  const download = (path: string, filename: string) => {
    setNotice(null)
    downloadFile(apiFetch, path, filename)
      .then(() => setNotice(`Downloaded ${filename}`))
      .catch(() => setNotice('Could not download the CSV. Try again.'))
  }

  return (
    <section className="dash-section as" aria-labelledby="h-assessments">
      <div className="dash-head">
        <div>
          <h2 className="dash-h2" id="h-assessments">
            Assessments
          </h2>
          <p className="dash-sub">
            How the cohort is doing on each assessment in the course. Open the live monitor to watch
            learners work, or view and download their results.
          </p>
        </div>
        <button
          type="button"
          className="dash-btn-secondary"
          onClick={() => download(`${base}/assessments.csv`, 'assessments.csv')}
        >
          Download all (CSV)
        </button>
      </div>
      {notice && (
        <p role="status" className="dash-muted as-notice">
          {notice}
        </p>
      )}
      <div className="dash-tablewrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th scope="col">Assessment</th>
              <th scope="col" className="num">
                Submitted
              </th>
              <th scope="col" className="num">
                In progress
              </th>
              <th scope="col" className="num">
                Not started
              </th>
              <th scope="col" className="num">
                Average
              </th>
              <th scope="col">Improvement</th>
              <th scope="col">
                <span className="dash-visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((i) => (
              <tr key={i.itemId}>
                <th scope="row" className="as-name">
                  {i.title}
                  {i.label && <span className="dash-chip">{i.label}</span>}
                </th>
                <td className="num">{i.counts.submitted}</td>
                <td className="num">{i.counts.inProgress}</td>
                <td className="num">{i.counts.notStarted}</td>
                <td className="num">{percentText(i.averageScore)}</td>
                <td>
                  {i.improvement ? (
                    <>
                      <strong>{changeText(i.improvement.change)}</strong>
                      <span className="dash-muted as-detail">
                        {improvementDetail(i.improvement)}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <div className="as-actions">
                    <a
                      className="dash-btn-quiet dash-btn-link"
                      aria-label={`Live monitor for ${i.title}`}
                      href={`${href(`/lms/cohorts/${encodeURIComponent(cohortId)}/monitor`)}${query ? '&' : '?'}item=${encodeURIComponent(i.itemId)}`}
                    >
                      Live monitor
                    </a>
                    <button
                      type="button"
                      className="dash-btn-quiet"
                      aria-label={`View results for ${i.title}`}
                      onClick={() => setViewing(i)}
                    >
                      View results
                    </button>
                    <button
                      type="button"
                      className="dash-btn-quiet"
                      aria-label={`Download CSV for ${i.title}`}
                      onClick={() =>
                        download(
                          `${base}/assessments/${i.itemId}/results.csv`,
                          `assessment-${fileSlug(i.title)}.csv`
                        )
                      }
                    >
                      Download CSV
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewing && (
        <ResultsModal
          cohortId={cohortId}
          row={viewing}
          onClose={() => setViewing(null)}
          onDownload={() =>
            download(
              `${base}/assessments/${viewing.itemId}/results.csv`,
              `assessment-${fileSlug(viewing.title)}.csv`
            )
          }
        />
      )}
    </section>
  )
}

/** Every learner's result on one assessment, with a way into their answers. */
export function ResultsModal({
  cohortId,
  row,
  onClose,
  onDownload,
}: {
  cohortId: string
  row: AssessmentSummaryRow
  onClose: () => void
  onDownload: () => void
}) {
  const results = useLoad<AssessmentResults>(
    `/learn/cohorts/${encodeURIComponent(cohortId)}/assessments/${row.itemId}/results`
  )
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
        { itemId: row.itemId }
      )
      submitLaunchForm(out.action, out.fields)
    } catch (err) {
      setError((err as Error).message)
      setOpening(null)
    }
  }

  const r = results.data
  const post = r?.label === 'post'
  return (
    <Modal
      title={`Results: ${row.title}`}
      onClose={onClose}
      wide
      className="as-modal"
      footer={
        <button type="button" className="dash-btn-secondary" onClick={onDownload}>
          Download CSV
        </button>
      }
    >
      {results.error ? (
        <div role="alert">
          <p className="dash-error">Could not load the results: {results.error.message}</p>
          <button type="button" className="dash-btn-quiet" onClick={results.reload}>
            Try again
          </button>
        </div>
      ) : !r ? (
        <p className="dash-loading">Loading results…</p>
      ) : (
        <>
          <p className="dash-muted">
            {[
              r.expectedMinutes !== null ? `Expected ${r.expectedMinutes} min` : null,
              r.medianMinutes !== null ? `Median ${r.medianMinutes} min` : null,
              r.improvement
                ? `Improvement over the pre-assessment ${changeText(r.improvement.change)} (${improvementDetail(r.improvement)})`
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'No one has submitted yet.'}
          </p>
          {error && <p className="dash-error">{error}</p>}
          <div className="dash-tablewrap">
            <table className="dash-table as-results">
              <thead>
                <tr>
                  <th scope="col">Learner</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">
                    Time
                  </th>
                  {r.sections.map((s) => (
                    <th key={s.id} scope="col" className="num" title={s.title}>
                      {s.title}
                    </th>
                  ))}
                  <th scope="col" className="num">
                    Overall
                  </th>
                  {post && (
                    <>
                      <th scope="col" className="num">
                        Pre
                      </th>
                      <th scope="col" className="num">
                        Change
                      </th>
                    </>
                  )}
                  <th scope="col">
                    <span className="dash-visually-hidden">Answers</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.learners.map((l) => (
                  <tr key={l.enrollmentId}>
                    <th scope="row">{l.name}</th>
                    <td>
                      {STATUS_WORDS[l.status]}
                      {l.late && <span className="dash-chip as-late">late</span>}
                    </td>
                    <td className="num">{minutesText(l.minutes)}</td>
                    {r.sections.map((s) => (
                      <td key={s.id} className="num">
                        {sectionText(l.sections.find((x) => x.sectionId === s.id))}
                      </td>
                    ))}
                    <td className="num">{percentText(l.overall)}</td>
                    {post && (
                      <>
                        <td className="num">{percentText(l.pre)}</td>
                        <td className="num">{l.change === null ? '—' : changeText(l.change)}</td>
                      </>
                    )}
                    <td>
                      {l.status === 'submitted' && (
                        <button
                          type="button"
                          className="dash-btn-quiet"
                          disabled={opening !== null}
                          onClick={() => void viewAnswers(l.enrollmentId)}
                        >
                          {opening === l.enrollmentId ? 'Opening…' : 'Answers'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  )
}
