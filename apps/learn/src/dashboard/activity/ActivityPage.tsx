import type {
  CohortActivityReport,
  CohortDetail,
  CohortListItem,
  LearnerActivityReport,
} from '@id/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { downloadFile, useApiFetch, useLoad } from '../api'
import { useApp } from '../app-context'
import { StatTile } from '../charts'
import { errorNotice } from '../shared'
import {
  chartBars,
  clockLocal,
  dayLabel,
  formatDuration,
  localTz,
  presetRange,
  rangeProblem,
  timeLocal,
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
    <details className="ac-caption ac-explainer">
      <summary>How is time counted?</summary>
      <p>
        Time is active time: the learner had a course page open in front of them and was clicking,
        typing or scrolling. Each stretch of time is a session with a start and a length.
      </p>
      <p>What is counted:</p>
      <ul>
        <li>Time on the course pages, checked about every 30 seconds.</li>
        <li>
          Time on an activity, from opening it until the learner leaves it, finishes it or comes
          back from a connected tool.
        </li>
        <li>
          Time in a connected tool, from launching it until its score comes back (at most 4 hours),
          because the tool opens in another window. This is the time between launch and return, not
          what the tool itself recorded.
        </li>
      </ul>
      <p>What is not counted:</p>
      <ul>
        <li>
          Time when the page is hidden or the learner has not clicked, typed or scrolled for a
          minute.
        </li>
        <li>
          A break of more than a minute and a half. It ends the session; the next one starts fresh.
        </li>
        <li>Time from before activity logging was switched on.</li>
      </ul>
      <p>Times are shown in your timezone.</p>
    </details>
  )
}

function useRange(tz: string) {
  const [preset, setPresetState] = useState<RangePreset>('last30')
  const [custom, setCustom] = useState({ from: '', to: '' })
  // "Last 7/30 days" counts back from the moment of the click, not from when the page opened.
  const [base, setBase] = useState(() => new Date())
  const setPreset = (p: RangePreset) => {
    setBase(new Date())
    setPresetState(p)
  }
  const problem = preset === 'custom' ? rangeProblem(custom.from, custom.to) : null
  const range = preset === 'custom' ? custom : presetRange(preset, base, tz)
  const query = problem ? null : `from=${range.from}&to=${range.to}&tz=${encodeURIComponent(tz)}`
  return { preset, setPreset, custom, setCustom, problem, range, query }
}

function CohortActivity({ cohortId }: { cohortId: string }) {
  const { href } = useApp()
  const apiFetch = useApiFetch()
  const tz = useMemo(localTz, [])
  const r = useRange(tz)
  const [learner, setLearner] = useState<{ id: string; name: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)
  const [downloaded, setDownloaded] = useState<string | null>(null)
  const headRef = useRef<HTMLHeadingElement>(null)
  const hadLearner = useRef(false)
  const base = `/learn/cohorts/${encodeURIComponent(cohortId)}/activity`
  const { data: cohort } = useLoad<CohortDetail>(`/learn/cohorts/${encodeURIComponent(cohortId)}`)
  const report = useLoad<CohortActivityReport>(r.query ? `${base}?${r.query}` : null)
  const log = useLoad<LearnerActivityReport>(
    learner && r.query ? `${base}/learners/${encodeURIComponent(learner.id)}?${r.query}` : null
  )

  // Going back from a learner's log: move focus to the cohort heading, not to a removed button.
  useEffect(() => {
    if (!learner && hadLearner.current) headRef.current?.focus()
    hadLearner.current = !!learner
  }, [learner])

  async function exportCsv() {
    if (!r.query) return
    setExporting(true)
    setExportError(false)
    setDownloaded(null)
    const file = `activity-${r.range.from}-to-${r.range.to}.csv`
    try {
      await downloadFile(apiFetch, `${base}.csv?${r.query}`, file)
      setDownloaded(file)
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
          <h1 className="dash-h2" tabIndex={-1} ref={headRef}>
            Activity{cohort ? `: ${cohort.name}` : ''}
          </h1>
          <p className="dash-sub">
            {r.problem
              ? 'Choose a date range.'
              : `${dayLabel(r.range.from)} to ${dayLabel(r.range.to)}`}
          </p>
        </div>
        <div className="ac-export">
          <button
            type="button"
            className="dash-btn"
            onClick={exportCsv}
            disabled={exporting || !r.query}
          >
            {exporting ? 'Preparing…' : 'Download CSV'}
          </button>
          {exportError && (
            <p role="alert" className="ac-error">
              The download did not work. Try again.
            </p>
          )}
          <p role="status" className="dash-muted ac-downloaded">
            {downloaded ? `Downloaded ${downloaded}` : ''}
          </p>
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
            <LearnerLog report={log.data} tz={tz} />
          )}
        </>
      ) : report.error ? (
        errorNotice(report.error)
      ) : report.loading || !report.data ? (
        <p className="dash-loading">Loading activity…</p>
      ) : (
        <CohortView report={report.data} tz={tz} onPick={(id, name) => setLearner({ id, name })} />
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
  tz,
  onPick,
}: {
  report: CohortActivityReport
  tz: string
  onPick: (userId: string, name: string) => void
}) {
  const { href } = useApp()
  const avg = report.averages
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
        <StatTile
          label="Average per learner"
          value={formatDuration(avg.perLearnerSeconds)}
          note={`Over all ${report.learners.length} ${report.learners.length === 1 ? 'learner' : 'learners'} listed`}
        />
        <StatTile
          label="Average per active day"
          value={formatDuration(avg.perActiveDaySeconds)}
          note="For a learner, on a day they had any time"
        />
        <StatTile
          label="Active learners"
          value={`${avg.activeLearners} of ${report.learners.length}`}
          note={`${avg.learnersPerDay} per day on average`}
        />
        <StatTile label="Total time" value={formatDuration(report.totalSeconds)} />
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
            <caption className="dash-visually-hidden">
              Time spent per learner. Select a name for the learner's record, or Daily log for their
              day-by-day sessions.
            </caption>
            <thead>
              <tr>
                <th scope="col">Learner</th>
                <th scope="col" className="num">
                  Total
                </th>
                <th scope="col" className="num">
                  Average per active day
                </th>
                <th scope="col" className="num">
                  Days active
                </th>
                <th scope="col">Last active</th>
                <th scope="col">
                  <span className="dash-visually-hidden">Daily log</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {report.learners.map((l) => (
                <tr key={l.userId}>
                  <th scope="row">
                    <a
                      className="ac-learner"
                      href={href(
                        `/lms/cohorts/${encodeURIComponent(report.cohortId)}/learners/${encodeURIComponent(l.userId)}`
                      )}
                    >
                      {l.name}
                    </a>
                  </th>
                  <td className="num">{formatDuration(l.totalSeconds)}</td>
                  <td className="num">
                    {l.activeDays > 0 ? formatDuration(l.averagePerActiveDaySeconds) : '—'}
                  </td>
                  <td className="num">{l.activeDays}</td>
                  <td>{timeLocal(l.lastSeenAt, tz)}</td>
                  <td>
                    <button
                      type="button"
                      className="dash-btn-quiet"
                      aria-label={`Daily log for ${l.name}`}
                      onClick={() => onPick(l.userId, l.name)}
                    >
                      Daily log
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {report.items.length > 0 && (
        <section className="dash-section" aria-labelledby="ac-h-items">
          <h2 className="dash-h2" id="ac-h-items">
            Time per activity
          </h2>
          <div className="dash-tablewrap">
            <table className="dash-table ac-table">
              <thead>
                <tr>
                  <th scope="col">Activity</th>
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

/**
 * One learner's log, in the viewer's timezone: a table by day (first start, last activity end,
 * total, sessions) where each day opens to its sessions (start, length, activity).
 */
export function LearnerLog({ report, tz }: { report: LearnerActivityReport; tz: string }) {
  const head = useRef<HTMLHeadingElement>(null)
  // Arriving from the cohort list: put focus on this learner's heading.
  useEffect(() => head.current?.focus(), [])
  return (
    <section aria-labelledby="ac-h-log">
      <h2 className="dash-h2" id="ac-h-log" tabIndex={-1} ref={head}>
        {report.name}
      </h2>
      <p className="dash-sub">
        {formatDuration(report.totalSeconds)} on {report.activeDays}{' '}
        {report.activeDays === 1 ? 'day' : 'days'}
        {report.activeDays > 0 &&
          `, ${formatDuration(report.averagePerActiveDaySeconds)} on an average active day`}
        , {dayLabel(report.from)} to {dayLabel(report.to)}.
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
                <th scope="col">First start</th>
                <th scope="col">Last activity end</th>
                <th scope="col" className="num">
                  Total
                </th>
                <th scope="col">Sessions</th>
              </tr>
            </thead>
            {report.days.map((d) => (
              <DayRows key={d.day} day={d} tz={tz} />
            ))}
          </table>
        </div>
      )}
    </section>
  )
}

export function DayRows({ day, tz }: { day: LearnerActivityReport['days'][number]; tz: string }) {
  const [open, setOpen] = useState(false)
  const listId = `ac-sessions-${day.day}`
  return (
    <tbody>
      <tr>
        <th scope="row">{dayLabel(day.day)}</th>
        <td>{clockLocal(day.firstSeenAt, tz)}</td>
        <td>{clockLocal(day.lastSeenAt, tz)}</td>
        <td className="num">{formatDuration(day.seconds)}</td>
        <td>
          <button
            type="button"
            className="dash-btn-quiet"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen(!open)}
          >
            {day.sessionCount} {day.sessionCount === 1 ? 'session' : 'sessions'}
            <span className="dash-visually-hidden">
              {open ? ', hide them' : ', show them'} for {dayLabel(day.day)}
            </span>
          </button>
        </td>
      </tr>
      {open && (
        <tr id={listId}>
          <td colSpan={5}>
            <ul className="ac-items">
              {day.sessions.map((x) => (
                <li key={`${x.startedAt}-${x.itemId ?? 'none'}`}>
                  {clockLocal(x.startedAt, tz)}, {formatDuration(x.seconds)}: {x.title}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </tbody>
  )
}
