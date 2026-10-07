import type { AttendanceSummary } from '@id/types'
import { useState } from 'react'
import { downloadFile, useApiFetch, useLoad } from '../api'
import { STATUS_LABEL, STATUS_LETTER, rateLabel } from './attendanceLogic'

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** Learners down, held sessions across: a letter and a colour per mark, plus the attendance rate. */
export function AttendanceSummaryView({ cohortId }: { cohortId: string }) {
  const { data, error, loading, reload } = useLoad<AttendanceSummary>(
    `/learn/cohorts/${cohortId}/attendance`
  )
  const apiFetch = useApiFetch()
  const [exportError, setExportError] = useState(false)
  const [downloaded, setDownloaded] = useState<string | null>(null)

  if (error)
    return (
      <div className="at-error">
        <p className="dash-error" role="alert">
          Could not load the attendance summary.
        </p>
        <button type="button" className="dash-btn-secondary" onClick={reload}>
          Try again
        </button>
      </div>
    )
  if (loading || !data) return <p className="dash-loading">Loading summary…</p>

  return (
    <div>
      <div className="at-summary-head">
        <p className="dash-muted">
          {data.sessions} session{data.sessions === 1 ? '' : 's'} held so far. The rate is present
          and late over the sessions that count for each learner: ones where attendance was taken
          and the learner had joined, leaving out excused ones. Someone with no mark in a session
          that was taken is absent.
        </p>
        <button
          type="button"
          className="dash-btn-secondary"
          onClick={() => {
            setExportError(false)
            setDownloaded(null)
            downloadFile(apiFetch, `/learn/cohorts/${cohortId}/attendance.csv`, 'attendance.csv')
              .then(() => setDownloaded('attendance.csv'))
              .catch(() => setExportError(true))
          }}
        >
          Export CSV
        </button>
      </div>
      <p role="status" className="dash-muted at-downloaded">
        {downloaded ? `Downloaded ${downloaded}` : ''}
      </p>
      {exportError && (
        <p className="dash-error" role="alert">
          Could not export the CSV. Try again.
        </p>
      )}
      <p className="dash-muted at-legend">
        P present, A absent (including no mark in a session that was taken), L late, E excused (left
        out of the rate), · does not count: attendance not taken yet, or before the learner joined.
      </p>
      {data.rows.length === 0 ? (
        <p className="dash-muted">No learners yet.</p>
      ) : (
        <div className="at-grid-wrap" tabIndex={0} role="region" aria-label="Attendance by session">
          <table className="at-grid">
            <thead>
              <tr>
                <th scope="col" className="at-g-name">
                  Learner
                </th>
                <th scope="col">Rate</th>
                {data.sessionList.map((s) => (
                  <th scope="col" key={s.id} title={s.title}>
                    <span className="dash-visually-hidden">
                      {s.title}, {day(s.startsAt)}
                      {s.taken ? '' : ', attendance not taken yet'}
                    </span>
                    <span className="at-g-title" aria-hidden="true">
                      {s.title}
                    </span>
                    <span className="dash-muted at-g-date" aria-hidden="true">
                      {day(s.startsAt)}
                    </span>
                    {!s.taken && (
                      <span className="dash-muted at-g-date" aria-hidden="true">
                        not taken yet
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.userId}>
                  <th scope="row" className="at-g-name">
                    {r.name}
                  </th>
                  <td className="at-g-rate">{rateLabel(r.ratePct)}</td>
                  {data.sessionList.map((s) => {
                    const st = r.marks[s.id]
                    const skip = r.skipped[s.id]
                    const word = st
                      ? STATUS_LABEL[st]
                      : skip === 'before_join'
                        ? 'before enrolled, not counted'
                        : 'attendance not taken yet'
                    return (
                      <td
                        key={s.id}
                        className={`at-cell ${st ? `at-s-${st}` : 'at-s-none'}`}
                        aria-label={`${r.name}, ${s.title}: ${word}`}
                      >
                        <span aria-hidden="true">{st ? STATUS_LETTER[st] : '·'}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
