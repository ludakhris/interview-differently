import type {
  CohortActivityReport,
  CohortDetail,
  CohortListItem,
  LearnerActivityReport,
} from '@id/types'
import { useMemo, useState } from 'react'
import { downloadFile, useApiFetch, useLoad } from '../api'
import { useApp } from '../app-context'
import { StatTile } from '../charts'
import { errorNotice } from '../shared'
import {
  chartBars,
  dayLabel,
  formatDuration,
  presetRange,
  rangeProblem,
  timeUtc,
  type RangePreset,
} from './activityLogic'
import './activity.css'

/**
 * #69 E, staff: daily per-learner and per-cohort activity with CSV export.
 * Mounted at /lms/activity (pick a cohort), and at /lms/activity/:cohortId with `cohortId` set.
 */
export function ActivityPage({ workspace, cohortId }: { workspace: string; cohortId?: string }) {
  return cohortId ? <CohortActivity cohortId={cohortId} /> : <CohortPicker workspace={workspace} />
}

function CohortPicker({ workspace }: { workspace: string }) {
  const { href } = useApp()
  const { data, error, loading } = useLoad<CohortListItem[]>(
    `/learn/workspaces/${encodeURIComponent(workspace)}/cohorts`
  )
  return (
    <div className="ac">
      <h1 className="dash-h2">Activity</h1>
      <p className="dash-sub">Choose a cohort to see how long its learners spent in the course.</p>
      {error ? (
        errorNotice(error)
      ) : loading || !data ? (
        <p className="dash-loading">Loading cohorts…</p>
      ) : data.length === 0 ? (
        <p className="dash-muted">There are no cohorts yet.</p>
      ) : (
        <ul className="ac-cohorts">
          {data.map((c) => (
            <li key={c.id}>
              <a href={href(`/lms/activity/${encodeURIComponent(c.id)}`)}>{c.name}</a>
              <span className="dash-muted">
                {' '}
                {c.courseTitle}, {c.enrolled} {c.enrolled === 1 ? 'learner' : 'learners'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Explainer() {
  return (
    <p className="ac-caption">
      <strong>Measured</strong> time is time the learner had a course page open in front of them and
      was active (clicking, typing or scrolling), counted by the server about every 30 seconds.{' '}
      <strong>Estimated</strong> time is for connected tools: the time from launch to the score
      coming back, at most 4 hours per launch. It is reported separately and can be above or below
      the real time. Days are UTC dates. Time before activity logging was switched on is not
      recorded.
    </p>
  )
}

function useRange() {
  const [preset, setPreset] = useState<RangePreset>('last30')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const base = useMemo(() => new Date(), [])
  const problem = preset === 'custom' ? rangeProblem(custom.from, custom.to) : null
  const range = preset === 'custom' ? custom : presetRange(preset, base)
  const query = problem ? null : `from=${range.from}&to=${range.to}`
  return { preset, setPreset, custom, setCustom, problem, range, query }
}

function CohortActivity({ cohortId }: { cohortId: string }) {
  const { href } = useApp()
  const apiFetch = useApiFetch()
  const r = useRange()
  const [learner, setLearner] = useState<{ id: string; name: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)
  const base = `/learn/cohorts/${encodeURIComponent(cohortId)}/activity`
  const { data: cohort } = useLoad<CohortDetail>(`/learn/cohorts/${encodeURIComponent(cohortId)}`)
  const report = useLoad<CohortActivityReport>(r.query ? `${base}?${r.query}` : null)
  const log = useLoad<LearnerActivityReport>(
    learner && r.query ? `${base}/learners/${encodeURIComponent(learner.id)}?${r.query}` : null
  )

  async function exportCsv() {
    if (!r.query) return
    setExporting(true)
    setExportError(false)
    try {
      await downloadFile(
        apiFetch,
        `${base}.csv?${r.query}`,
        `activity-${r.range.from}-to-${r.range.to}.csv`
      )
    } catch {
      setExportError(true)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="ac">
      <p>
        <a href={href(`/lms/activity`)}>All cohorts</a>
        {' / '}
        <a href={href(`/lms/cohorts/${encodeURIComponent(cohortId)}`)}>
          {cohort?.name ?? 'Cohort'}
        </a>
      </p>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">Activity{cohort ? `: ${cohort.name}` : ''}</h1>
          <p className="dash-sub">
            {r.problem ? 'Choose a date range.' : `${r.range.from} to ${r.range.to}`}
          </p>
        </div>
        <div className="ac-export">
          <button
            type="button"
            className="dash-btn"
            onClick={exportCsv}
            disabled={exporting || !r.query}
          >
            {exporting ? 'Preparing…' : 'Download CSV for grant reporting'}
          </button>
          {exportError && (
            <p role="alert" className="ac-error">
              The download did not work. Try again.
            </p>
          )}
        </div>
      </div>

      <RangePicker r={r} />
      <Explainer />

      {r.problem ? (
        <p className="dash-muted">{r.problem}</p>
      ) : learner ? (
        <>
          <p>
            <button type="button" className="dash-btn-quiet" onClick={() => setLearner(null)}>
              ← Back to the cohort
            </button>
          </p>
          {log.error ? (
            errorNotice(log.error)
          ) : log.loading || !log.data ? (
            <p className="dash-loading">Loading {learner.name}…</p>
          ) : (
            <LearnerLog report={log.data} />
          )}
        </>
      ) : report.error ? (
        errorNotice(report.error)
      ) : report.loading || !report.data ? (
        <p className="dash-loading">Loading activity…</p>
      ) : (
        <CohortView report={report.data} onPick={(id, name) => setLearner({ id, name })} />
      )}
    </div>
  )
}

function RangePicker({ r }: { r: ReturnType<typeof useRange> }) {
  const presets: { id: RangePreset; label: string }[] = [
    { id: 'last7', label: 'Last 7 days' },
    { id: 'last30', label: 'Last 30 days' },
    { id: 'custom', label: 'Custom' },
  ]
  return (
    <div className="ac-range">
      <div className="ac-presets" role="group" aria-label="Date range">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className="ac-preset"
            aria-pressed={r.preset === p.id}
            onClick={() => r.setPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {r.preset === 'custom' && (
        <div className="ac-custom">
          <label>
            From
            <input
              type="date"
              value={r.custom.from}
              onChange={(e) => r.setCustom({ ...r.custom, from: e.target.value })}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={r.custom.to}
              onChange={(e) => r.setCustom({ ...r.custom, to: e.target.value })}
            />
          </label>
          {r.problem && r.custom.from && r.custom.to && (
            <p role="alert" className="ac-error">
              {r.problem}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function CohortView({
  report,
  onPick,
}: {
  report: CohortActivityReport
  onPick: (userId: string, name: string) => void
}) {
  const estimated = report.learners.reduce((n, l) => n + l.estimatedSeconds, 0)
  const active = report.learners.filter((l) => l.totalSeconds > 0).length
  if (report.totalSeconds === 0) {
    return (
      <p className="dash-muted ac-empty">
        No activity was recorded for this cohort in this period.
      </p>
    )
  }
  return (
    <>
      <section aria-label="Totals" className="dash-tiles">
        <StatTile label="Total time" value={formatDuration(report.totalSeconds)} />
        <StatTile
          label="Measured"
          value={formatDuration(report.totalSeconds - estimated)}
          note="Page open and active"
        />
        <StatTile label="Estimated" value={formatDuration(estimated)} note="Connected tools" />
        <StatTile label="Learners with time" value={`${active} of ${report.learners.length}`} />
      </section>

      <section className="dash-section" aria-labelledby="ac-h-days">
        <h2 className="dash-h2" id="ac-h-days">
          Time per day
        </h2>
        <DailyBars days={report.days} />
      </section>

      <section className="dash-section" aria-labelledby="ac-h-learners">
        <h2 className="dash-h2" id="ac-h-learners">
          Learners
        </h2>
        <div className="dash-tablewrap">
          <table className="dash-table ac-table">
            <caption className="ac-sr">
              Time spent per learner. Select a learner to see their day-by-day log.
            </caption>
            <thead>
              <tr>
                <th scope="col">Learner</th>
                <th scope="col" className="num">
                  Total
                </th>
                <th scope="col" className="num">
                  Measured
                </th>
                <th scope="col" className="num">
                  Estimated
                </th>
                <th scope="col" className="num">
                  Days active
                </th>
                <th scope="col">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {report.learners.map((l) => (
                <tr key={l.userId}>
                  <th scope="row">
                    <button
                      type="button"
                      className="dash-btn-quiet ac-learner"
                      onClick={() => onPick(l.userId, l.name)}
                    >
                      {l.name}
                    </button>
                  </th>
                  <td className="num">{formatDuration(l.totalSeconds)}</td>
                  <td className="num">{formatDuration(l.totalSeconds - l.estimatedSeconds)}</td>
                  <td className="num">
                    {l.estimatedSeconds > 0 ? formatDuration(l.estimatedSeconds) : '—'}
                  </td>
                  <td className="num">{l.activeDays}</td>
                  <td>{timeUtc(l.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {report.items.length > 0 && (
        <section className="dash-section" aria-labelledby="ac-h-items">
          <h2 className="dash-h2" id="ac-h-items">
            Time per item
          </h2>
          <div className="dash-tablewrap">
            <table className="dash-table ac-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" className="num">
                    Time
                  </th>
                  <th scope="col" className="num">
                    Learners
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((i) => (
                  <tr key={i.itemId ?? 'none'}>
                    <th scope="row">{i.title}</th>
                    <td className="num">{formatDuration(i.seconds)}</td>
                    <td className="num">{i.learners}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

/** Bars for each day (each week for a long range), with the same figures as a table underneath. */
export function DailyBars({
  days,
}: {
  days: { day: string; seconds: number; learners: number }[]
}) {
  const bars = chartBars(days)
  const max = Math.max(1, ...bars.map((b) => b.seconds))
  const weekly = bars.length !== days.length
  const peak = bars.reduce((a, b) => (b.seconds > a.seconds ? b : a), bars[0])
  const label = (b: { start: string; end: string }) =>
    b.start === b.end ? dayLabel(b.start) : `${dayLabel(b.start)} to ${dayLabel(b.end)}`
  return (
    <>
      <div
        className="ac-chart"
        role="img"
        aria-label={`Time per ${weekly ? 'week' : 'day'}. Most: ${formatDuration(peak.seconds)}, ${label(peak)}.`}
      >
        {bars.map((b) => (
          <div key={b.start} className="ac-col" title={`${label(b)}: ${formatDuration(b.seconds)}`}>
            <div className="ac-bar" style={{ height: `${(b.seconds / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="ac-axis" aria-hidden="true">
        <span>{dayLabel(bars[0].start)}</span>
        <span>{dayLabel(bars[bars.length - 1].end)}</span>
      </div>
      <details className="ac-details">
        <summary>Show the {weekly ? 'weekly' : 'daily'} figures as a table</summary>
        <div className="dash-tablewrap">
          <table className="dash-table ac-table">
            <thead>
              <tr>
                <th scope="col">{weekly ? 'Week' : 'Day'}</th>
                <th scope="col" className="num">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {bars.map((b) => (
                <tr key={b.start}>
                  <th scope="row">{label(b)}</th>
                  <td className="num">{formatDuration(b.seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  )
}

/** One learner's day-by-day log: when they were seen and minutes per item, estimates marked. */
export function LearnerLog({ report }: { report: LearnerActivityReport }) {
  return (
    <section aria-labelledby="ac-h-log">
      <h2 className="dash-h2" id="ac-h-log">
        {report.name}
      </h2>
      <p className="dash-sub">
        {formatDuration(report.totalSeconds)} on {report.activeDays}{' '}
        {report.activeDays === 1 ? 'day' : 'days'}, {report.from} to {report.to}.
      </p>
      {report.days.length === 0 ? (
        <p className="dash-muted ac-empty">
          No activity was recorded for this learner in this period.
        </p>
      ) : (
        <div className="dash-tablewrap">
          <table className="dash-table ac-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">First seen</th>
                <th scope="col">Last seen</th>
                <th scope="col" className="num">
                  Time
                </th>
                <th scope="col">By item</th>
              </tr>
            </thead>
            <tbody>
              {report.days.map((d) => (
                <tr key={d.day}>
                  <th scope="row">{dayLabel(d.day)}</th>
                  <td>{timeUtc(d.firstSeenAt)}</td>
                  <td>{timeUtc(d.lastSeenAt)}</td>
                  <td className="num">{formatDuration(d.seconds)}</td>
                  <td>
                    <ul className="ac-items">
                      {d.items.map((i) => (
                        <li key={`${i.itemId}-${i.estimated}`}>
                          {i.title}: {formatDuration(i.seconds)}
                          {i.estimated && <span className="ac-tag"> (estimated)</span>}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
