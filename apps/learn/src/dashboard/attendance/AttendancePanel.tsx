import './attendance.css'
import type { AttendanceSummary, CohortSessionDto } from '@id/types'
import { useMemo, useState } from 'react'
import { downloadFile, useApiFetch, useApiSend, useLoad } from '../api'
import { useApp } from '../app-context'
import { RecordModal, SessionModal, ViewModal } from './AttendanceModals'
import { AttendanceLegend, AttendanceSummaryView } from './AttendanceSummaryView'
import {
  LOW_RATE_PCT,
  attendanceStats,
  defaultSessionTitle,
  isTaken,
  rateLabel,
  whenLabel,
} from './attendanceLogic'

type ModalState = { kind: 'add' } | { kind: 'edit' | 'record' | 'view'; id: string } | null

const slug = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'session'

/**
 * Attendance for a live or hybrid cohort: a status strip, the sessions as a roster-style table with
 * an action row per session (record, view, download, edit, delete in dialogs), and the
 * learner-by-session grid folded underneath (closed until opened). CohortPage mounts it after the Roster.
 */
export function AttendancePanel({ cohortId }: { cohortId: string }) {
  const send = useApiSend()
  const apiFetch = useApiFetch()
  const { href } = useApp()
  const sessions = useLoad<CohortSessionDto[]>(`/learn/cohorts/${cohortId}/sessions`)
  const summary = useLoad<AttendanceSummary>(`/learn/cohorts/${cohortId}/attendance`)
  const [modal, setModal] = useState<ModalState>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [gridOpen, setGridOpen] = useState<boolean | null>(null)
  const [belowOnly, setBelowOnly] = useState(false)

  const list = sessions.data
  const stats = useMemo(
    () => attendanceStats(list ?? [], summary.data, Date.now()),
    [list, summary.data]
  )
  const open = gridOpen ?? false
  const current =
    modal && modal.kind !== 'add' ? (list?.find((s) => s.id === modal.id) ?? null) : null

  const reloadAll = () => {
    sessions.reload()
    summary.reload()
  }

  const download = (path: string, filename: string) => {
    setMessage(null)
    setNotice(null)
    downloadFile(apiFetch, path, filename)
      .then(() => setNotice(`Downloaded ${filename}`))
      .catch(() => setMessage('Could not download the CSV. Try again.'))
  }

  const remove = async (s: CohortSessionDto) => {
    if (!window.confirm(`Delete "${s.title}" and all of its attendance marks?`)) return
    setBusy(true)
    setMessage(null)
    setNotice(null)
    try {
      await send('DELETE', `/learn/cohorts/${cohortId}/sessions/${s.id}`)
      reloadAll()
    } catch (e) {
      setMessage((e as Error).message || 'Could not delete the session.')
    } finally {
      setBusy(false)
    }
  }

  const showBelow = () => {
    setBelowOnly(true)
    setGridOpen(true)
  }

  return (
    <section className="dash-section at" aria-labelledby="h-attendance">
      <div className="dash-head">
        <div>
          <h2 className="dash-h2" id="h-attendance">
            Attendance
          </h2>
          <p className="dash-sub">Sessions, who came, and any notes.</p>
        </div>
        <button
          type="button"
          className="dash-btn"
          onClick={() => {
            setNotice(null)
            setModal({ kind: 'add' })
          }}
        >
          Add session
        </button>
      </div>

      {sessions.error ? (
        <div className="at-error">
          <p className="dash-error" role="alert">
            Could not load the sessions.
          </p>
          <button type="button" className="dash-btn-secondary" onClick={sessions.reload}>
            Try again
          </button>
        </div>
      ) : !list ? (
        <p className="dash-loading">Loading sessions…</p>
      ) : (
        <>
          <dl className="at-strip" aria-label="Attendance status">
            <div className="at-stat">
              <dt>Sessions</dt>
              <dd>
                {stats.held} held · {stats.upcoming} upcoming
              </dd>
            </div>
            <div className="at-stat">
              <dt>Attendance rate</dt>
              <dd>{summary.data ? rateLabel(stats.overallPct) : '…'}</dd>
            </div>
            <div className="at-stat">
              <dt>Last session</dt>
              <dd>
                {stats.last
                  ? `${new Date(stats.last.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${stats.last.counts.present} present`
                  : 'None taken yet'}
              </dd>
            </div>
            <div className="at-stat">
              <dt>Below {LOW_RATE_PCT}%</dt>
              <dd>
                {!summary.data ? (
                  '…'
                ) : stats.below.length === 0 ? (
                  'No one'
                ) : (
                  <button type="button" className="at-link" onClick={showBelow}>
                    {stats.below.length} {stats.below.length === 1 ? 'learner' : 'learners'}
                  </button>
                )}
              </dd>
            </div>
          </dl>

          {message && (
            <p className="dash-error" role="alert">
              {message}
            </p>
          )}
          <p className="dash-muted at-notice" role="status">
            {notice ?? ''}
          </p>

          {list.length === 0 ? (
            <div className="dash-empty">
              <h3 className="dash-card-title">No sessions yet</h3>
              <p>Add a session to start taking attendance. It is named and timed for you.</p>
            </div>
          ) : (
            <div className="dash-tablewrap at-sessions-wrap">
              <table className="dash-table at-sessions" aria-label="Sessions">
                <thead>
                  <tr>
                    <th scope="col">Session</th>
                    <th scope="col">When</th>
                    <th scope="col">Attendance</th>
                    <th scope="col">
                      <span className="dash-visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((s) => {
                    const taken = isTaken(s)
                    return (
                      <tr key={s.id}>
                        <th scope="row">
                          {s.title}
                          {s.location && <span className="dash-muted at-loc">{s.location}</span>}
                        </th>
                        <td className="dash-nowrap">{whenLabel(s.startsAt)}</td>
                        <td>
                          {taken ? (
                            <span className="at-tally">
                              <span className="at-t-present">{s.counts.present} present</span>
                              <span className="at-t-absent">{s.counts.absent} absent</span>
                              <span className="at-t-late">{s.counts.late} late</span>
                              <span className="at-t-excused">{s.counts.excused} excused</span>
                            </span>
                          ) : (
                            <span className="dash-muted">Not taken yet</span>
                          )}
                        </td>
                        <td className="at-actions">
                          <button
                            type="button"
                            className="dash-btn-secondary at-primary"
                            aria-label={`${taken ? 'Edit attendance' : 'Record attendance'} for ${s.title}`}
                            onClick={() => setModal({ kind: 'record', id: s.id })}
                          >
                            {taken ? 'Edit attendance' : 'Record attendance'}
                          </button>{' '}
                          <button
                            type="button"
                            className="dash-btn-quiet"
                            aria-label={`View attendance for ${s.title}`}
                            onClick={() => setModal({ kind: 'view', id: s.id })}
                          >
                            View
                          </button>{' '}
                          <button
                            type="button"
                            className="dash-btn-quiet"
                            aria-label={`Download CSV for ${s.title}`}
                            onClick={() =>
                              download(
                                `/learn/cohorts/${cohortId}/sessions/${s.id}/attendance.csv`,
                                `attendance-${slug(s.title)}.csv`
                              )
                            }
                          >
                            Download CSV
                          </button>{' '}
                          <button
                            type="button"
                            className="dash-btn-quiet"
                            aria-label={`Edit session ${s.title}`}
                            onClick={() => setModal({ kind: 'edit', id: s.id })}
                          >
                            Edit session
                          </button>{' '}
                          <button
                            type="button"
                            className="dash-btn-quiet"
                            aria-label={`Delete session ${s.title}`}
                            disabled={busy}
                            onClick={() => remove(s)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="at-grid-section">
            <div className="at-grid-head">
              <button
                type="button"
                className="at-fold"
                aria-expanded={open}
                aria-controls="at-grid-body"
                onClick={() => setGridOpen(!open)}
              >
                <svg className="at-fold-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 5h16v14H4zM4 10h16M4 15h16M9 5v14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="at-fold-text">
                  <strong>Attendance by learner</strong>
                  <small>See every learner across every session</small>
                </span>
                <span className="at-fold-action">
                  {open ? 'Hide' : 'Show'} <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                </span>
              </button>
              <button
                type="button"
                className="dash-btn-secondary"
                onClick={() =>
                  download(`/learn/cohorts/${cohortId}/attendance.csv`, 'attendance.csv')
                }
              >
                Download CSV
              </button>
            </div>
            {!open && <AttendanceLegend />}
            {open && (
              <div id="at-grid-body">
                <AttendanceLegend />
                {summary.error ? (
                  <div className="at-error">
                    <p className="dash-error" role="alert">
                      Could not load the attendance summary.
                    </p>
                    <button type="button" className="dash-btn-secondary" onClick={summary.reload}>
                      Try again
                    </button>
                  </div>
                ) : !summary.data ? (
                  <p className="dash-loading">Loading summary…</p>
                ) : (
                  <>
                    <p className="dash-muted at-rule">
                      Rate: present and late over the sessions that count for the learner
                      (attendance taken, learner already joined), leaving out excused ones.
                    </p>
                    {belowOnly && (
                      <p className="at-filter" role="status">
                        Showing {stats.below.length}{' '}
                        {stats.below.length === 1 ? 'learner' : 'learners'} below {LOW_RATE_PCT}%.{' '}
                        <button
                          type="button"
                          className="at-link"
                          onClick={() => setBelowOnly(false)}
                        >
                          Show everyone
                        </button>
                      </p>
                    )}
                    <AttendanceSummaryView
                      data={summary.data}
                      href={href}
                      cohortId={cohortId}
                      onlyUserIds={belowOnly ? stats.below : null}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {modal?.kind === 'add' && list && (
        <SessionModal
          cohortId={cohortId}
          session={null}
          defaultTitle={defaultSessionTitle(list)}
          onClose={() => setModal(null)}
          onDone={(made) => {
            setModal(null)
            setNotice(`Added ${made.title}.`)
            reloadAll()
          }}
        />
      )}
      {modal?.kind === 'edit' && current && (
        <SessionModal
          cohortId={cohortId}
          session={current}
          defaultTitle={current.title}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null)
            reloadAll()
          }}
        />
      )}
      {modal?.kind === 'record' && current && (
        <RecordModal
          key={current.id}
          cohortId={cohortId}
          session={current}
          taken={isTaken(current)}
          onClose={() => setModal(null)}
          onSaved={reloadAll}
        />
      )}
      {modal?.kind === 'view' && current && (
        <ViewModal
          key={current.id}
          cohortId={cohortId}
          session={current}
          taken={isTaken(current)}
          onClose={() => setModal(null)}
          onRecord={() => setModal({ kind: 'record', id: current.id })}
          onDownload={() =>
            download(
              `/learn/cohorts/${cohortId}/sessions/${current.id}/attendance.csv`,
              `attendance-${slug(current.title)}.csv`
            )
          }
        />
      )}
    </section>
  )
}
