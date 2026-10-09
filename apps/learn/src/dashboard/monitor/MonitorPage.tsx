import type {
  AssessmentMonitorDelivery,
  CohortAssessmentMonitor,
  CohortDetail,
  CohortSqlMonitor,
  SqlMonitorStudent,
} from '@id/types'
import { useEffect, useState } from 'react'
import { useLoad } from '../api'
import { useApp } from '../app-context'
import { errorNotice } from '../shared'
import {
  AUTO_REFRESH_DEFAULT,
  AUTO_REFRESH_SECONDS,
  QUERIES_SHOWN,
  STATUS_WORDS,
  limitText,
  monitorEntries,
  progressPercent,
  progressText,
  sortStudents,
  whenText,
  type MonitorEntry,
  type SortDir,
  type SortKey,
} from './monitorLogic'
import './monitor.css'

/**
 * Staff: what a cohort's learners are doing in the Simulator right now: how far through each
 * assessment, and the SQL they run. Read from the Simulator; refreshes on request, or on a timer
 * the staff member turns on. Mounted at /lms/cohorts/:id/monitor.
 */
export function MonitorPage({ cohortId }: { cohortId: string }) {
  const { href } = useApp()
  const base = `/learn/cohorts/${encodeURIComponent(cohortId)}`
  const { data: cohort } = useLoad<CohortDetail>(base)
  const assessments = useLoad<CohortAssessmentMonitor>(`${base}/monitor/assessments`)
  const sql = useLoad<CohortSqlMonitor>(`${base}/monitor/sql`)
  // Nothing is chosen for the staff member. The cohort page's Live monitor button opens one
  // directly with ?item=<course item id>.
  const [selected, setSelected] = useState<string>('')
  const linked = new URLSearchParams(window.location.search).get('item')
  const [auto, setAuto] = useState(false)
  const [seconds, setSeconds] = useState<number>(AUTO_REFRESH_DEFAULT)

  const entries = monitorEntries(assessments.data, sql.data?.enabled === true)
  const chosen =
    entries.find((e) => e.id === selected) ??
    (selected === '' && linked ? entries.find((e) => e.delivery?.itemId === linked) : null) ??
    null
  const active = chosen?.sql ? sql : assessments
  const { reload } = active
  // Refresh only the tab in view, and never stack requests: the next tick waits for the last load.
  useEffect(() => {
    if (!auto) return
    const id = window.setInterval(() => {
      if (!active.loading) reload()
    }, seconds * 1000)
    return () => window.clearInterval(id)
  }, [auto, seconds, active.loading, reload])

  const generatedAt = active.data?.generatedAt ?? null

  return (
    <div className="mon">
      <p>
        <a href={href(`/lms/cohorts/${encodeURIComponent(cohortId)}`)}>
          {cohort?.name ?? 'Cohort'}
        </a>
      </p>
      <h1 className="dash-h2">Live monitor{cohort ? `: ${cohort.name}` : ''}</h1>
      <p className="dash-sub">
        This lets you monitor live student activity on your assessment (being done in the skills
        simulator).
      </p>

      {entries.length > 0 && (
        <label className="mon-pick">
          <span>Assessment:</span>
          <select value={chosen?.id ?? ''} onChange={(e) => setSelected(e.target.value)}>
            <option value="" disabled>
              Choose an assessment…
            </option>
            {entries.map((e) => {
              const live = e.delivery?.counts.inProgress ?? 0
              return (
                <option key={e.id} value={e.id}>
                  {e.label}
                  {live > 0 ? ` (${live} in progress)` : ''}
                </option>
              )
            })}
          </select>
        </label>
      )}

      <div className="mon-fresh">
        <span>Last updated {generatedAt ? whenText(generatedAt) : '—'}</span>
        <button type="button" className="mon-refresh" onClick={reload} disabled={active.loading}>
          {active.loading ? 'Refreshing…' : 'Refresh now'}
        </button>
        <label className="mon-auto">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span>Refresh automatically every</span>
          <select
            aria-label="Refresh interval"
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
          >
            {AUTO_REFRESH_SECONDS.map((s) => (
              <option key={s} value={s}>
                {s} seconds
              </option>
            ))}
          </select>
        </label>
      </div>

      <MonitorBody state={assessments} sql={sql} entry={chosen} />
    </div>
  )
}

function MonitorBody({
  state,
  sql,
  entry,
}: {
  state: { data: CohortAssessmentMonitor | null; error: Error | null; loading: boolean }
  sql: { data: CohortSqlMonitor | null; error: Error | null; loading: boolean }
  entry: MonitorEntry | null
}) {
  if (state.error && !state.data) return errorNotice(state.error)
  if (!state.data) return <p className="dash-loading">Loading assessments…</p>
  if (!entry)
    return (
      <p className="dash-muted">
        {state.data.deliveries.length + state.data.other.length === 0
          ? 'This course has no assessments.'
          : 'Choose an assessment to see how its learners are getting on.'}
      </p>
    )
  if (entry.sql) return <SqlTab state={sql} />
  return (
    <>
      {entry.outside && (
        <p className="dash-muted">
          This was scheduled for the cohort directly in Interview Differently, not through the
          course. Add assessments to the course here in Learn Differently instead.
        </p>
      )}
      {entry.delivery && <DeliveryCard delivery={entry.delivery} />}
    </>
  )
}

export function DeliveryCard({ delivery: d }: { delivery: AssessmentMonitorDelivery }) {
  const limit = limitText(d.timeLimitMinutes)
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'status', dir: 'asc' })
  const students = sortStudents(d.students, sort.key, sort.dir)
  const heading = (key: SortKey, label: string) => (
    <th
      scope="col"
      aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="mon-sort"
        onClick={() =>
          setSort((cur) =>
            cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
          )
        }
      >
        {label}
        <span aria-hidden="true">{sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
      </button>
    </th>
  )
  return (
    <section className="dash-card" aria-label={d.label}>
      <h2 className="dash-card-title">
        {d.label}
        {d.tags.map((t) => (
          <span key={t}>
            {' '}
            <span className="dash-chip">{t}</span>
          </span>
        ))}
      </h2>
      <p className="dash-muted">
        {[d.assessmentTitle ? `Assessment: ${d.assessmentTitle}` : null, limit]
          .filter(Boolean)
          .join(' · ') || 'Not started yet'}
      </p>
      <p>
        <span className="mon-live">{d.counts.submitted} submitted</span> · {d.counts.inProgress} in
        progress · {d.counts.notStarted} not started
      </p>
      <div className="dash-tablewrap">
        <table className="dash-table">
          <thead>
            <tr>
              {heading('name', 'Learner')}
              {heading('status', 'Status')}
              {heading('progress', 'Progress')}
              {heading('saved', 'Last saved')}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.userId}>
                <td>{s.name}</td>
                <td>{STATUS_WORDS[s.status]}</td>
                <td>
                  {s.status === 'not_started' ? (
                    '—'
                  ) : (
                    <>
                      <span
                        className={`mon-bar${s.status === 'submitted' ? ' mon-bar-done' : ''}`}
                        role="img"
                        aria-label={progressText(s)}
                      >
                        <span style={{ width: `${progressPercent(s)}%` }} />
                      </span>{' '}
                      {progressText(s)}
                    </>
                  )}
                </td>
                <td>{whenText(s.lastActivityAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SqlTab({
  state,
}: {
  state: { data: CohortSqlMonitor | null; error: Error | null; loading: boolean }
}) {
  if (state.error && !state.data) return errorNotice(state.error)
  if (!state.data) return <p className="dash-loading">Loading SQL activity…</p>
  if (!state.data.enabled)
    return <p className="dash-muted">This cohort does not use the SQL sandbox.</p>
  return (
    <>
      <p className="dash-muted">
        Queries are kept for {state.data.retentionDays} days. Newest first.
      </p>
      {state.data.students.map((s) => (
        <SqlStudent key={s.userId} student={s} />
      ))}
    </>
  )
}

export function SqlStudent({ student: s }: { student: SqlMonitorStudent }) {
  const [all, setAll] = useState(false)
  const shown = all ? s.queries : s.queries.slice(0, QUERIES_SHOWN)
  const hidden = s.queries.length - shown.length
  return (
    <details className="dash-card mon-student" open={s.queryCount > 0}>
      <summary>
        <strong>{s.name}</strong>
        {' · '}
        {s.queryCount} {s.queryCount === 1 ? 'query' : 'queries'}
        {s.errorCount > 0 && (
          <span className="mon-err">
            {' '}
            · {s.errorCount} {s.errorCount === 1 ? 'error' : 'errors'}
          </span>
        )}
        {s.lastQueryAt ? ` · last ${whenText(s.lastQueryAt)}` : ''}
      </summary>
      {s.queries.length === 0 ? (
        <p className="dash-muted">No queries yet.</p>
      ) : (
        <>
          {shown.map((q) => (
            <div key={q.id} className="mon-query">
              <p className="dash-muted">
                <span className={q.ok ? undefined : 'mon-err'}>{q.ok ? 'OK' : 'Error'}</span>
                {' · '}
                {whenText(q.createdAt)} · {q.datasetSlug}
                {q.ok && q.rowCount !== null ? ` · ${q.rowCount} rows` : ''}
                {q.durationMs !== null ? ` · ${q.durationMs} ms` : ''}
              </p>
              <pre>{q.queryText}</pre>
              {q.errorMessage && <p className="mon-err">{q.errorMessage}</p>}
            </div>
          ))}
          {hidden > 0 && (
            <button type="button" className="dash-btn-quiet" onClick={() => setAll(true)}>
              Show {hidden} older {hidden === 1 ? 'query' : 'queries'}
            </button>
          )}
          {all && s.queries.length > QUERIES_SHOWN && (
            <button type="button" className="dash-btn-quiet" onClick={() => setAll(false)}>
              Show fewer
            </button>
          )}
        </>
      )}
    </details>
  )
}
