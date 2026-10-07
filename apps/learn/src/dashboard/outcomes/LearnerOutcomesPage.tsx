import type { LearnerOutcomeCohort, LearnerOutcomes } from '@id/types'
import { useLoad } from '../api'
import { useApp } from '../app-context'
import { dateOnly, dateShort } from '../format'
import {
  attemptsText,
  averageScore,
  completionText,
  itemStatusLabel,
  readinessSummary,
  readinessText,
  recentResults,
  scoredItems,
  scoreText,
  skillState,
  skillStateLabel,
} from './outcomesText'
import './outcomes.css'

/** A horizontal bar for a 0-100 value. Decoration only: the number is always written beside it. */
function Bar({ value, goal }: { value: number | null; goal?: number }) {
  return (
    <span className="lo-bar" aria-hidden="true">
      <span className="lo-bar-track">
        {value !== null && <span className="lo-bar-fill" style={{ width: `${value}%` }} />}
        {goal !== undefined && <span className="lo-bar-goal" style={{ left: `${goal}%` }} />}
      </span>
    </span>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="lo-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {note && <dd className="lo-note">{note}</dd>}
    </div>
  )
}

function CohortCard({ c }: { c: LearnerOutcomeCohort }) {
  const { href } = useApp()
  const scored = scoredItems(c)
  const headingId = `lo-c-${c.cohortId}`
  return (
    <li className="dash-card lo-card" aria-labelledby={headingId}>
      <div className="lo-card-head">
        <div>
          <h3 className="lo-card-title" id={headingId}>
            {c.courseTitle}
          </h3>
          <p className="dash-sub lo-meta">
            {c.cohortName} · {c.host} · {dateOnly(c.startsAt)} to {dateOnly(c.endsAt)}
          </p>
        </div>
        <a className="lo-link" href={href(`/lms/learning/${c.cohortId}`)}>
          Open course <span className="dash-visually-hidden">{c.courseTitle}</span>
        </a>
      </div>

      <div className="lo-progress">
        <Bar value={c.percent} />
        <span>
          {c.itemsDone} of {c.itemsTotal} items done ({c.percent}%)
        </span>
      </div>
      <p className="lo-state">
        <strong>{completionText(c)}</strong>
        {c.enrollmentStatus === 'completed' && c.completedAt && <> on {dateShort(c.completedAt)}</>}
      </p>
      <p className="lo-note">Interview readiness: {readinessText(c)}</p>
      {(c.readiness.pre !== null || c.readiness.post !== null) && (
        <p className="lo-note">
          Before the course: {scoreText(c.readiness.pre)} · After: {scoreText(c.readiness.post)}
          {c.readiness.gain !== null && (
            <>
              {' '}
              · Change: {c.readiness.gain > 0 ? '+' : c.readiness.gain < 0 ? '−' : ''}
              {Math.abs(c.readiness.gain)} points
            </>
          )}
        </p>
      )}

      {c.skills.length > 0 && (
        <section aria-label={`Skills in ${c.courseTitle}`}>
          <h4 className="lo-sub">Skills</h4>
          <ul className="lo-list">
            {c.skills.map((s) => {
              const state = skillState(s)
              return (
                <li key={s.id} className="lo-row">
                  <span className="lo-row-name">{s.label}</span>
                  <Bar value={s.pct} goal={s.targetPct} />
                  <span className="lo-row-val">
                    {scoreText(s.pct)} <span className="lo-note">(goal {s.targetPct}%)</span>
                  </span>
                  <span className={`lo-tag lo-tag-${state}`}>{skillStateLabel[state]}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section aria-label={`Scores in ${c.courseTitle}`}>
        <h4 className="lo-sub">Best scores</h4>
        {scored.length === 0 ? (
          <p className="lo-note">No scored items yet.</p>
        ) : (
          <ul className="lo-list">
            {scored.map((i) => (
              <li key={i.itemId} className="lo-row">
                <span className="lo-row-name">
                  <a href={href(`/lms/learning/${c.cohortId}/${i.itemId}`)}>{i.title}</a>
                </span>
                <Bar value={i.score} />
                <span className="lo-row-val">{scoreText(i.score)}</span>
                <span className="lo-tag">
                  {attemptsText(i.attempts)} · {itemStatusLabel(i.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </li>
  )
}

function Content({ data }: { data: LearnerOutcomes }) {
  const { href } = useApp()
  if (data.cohorts.length === 0) {
    return (
      <div className="dash-empty">
        <h2 className="dash-card-title">No outcomes yet</h2>
        <p>
          Your results will show here once you join a course.{' '}
          <a href={href('/lms/learning')}>Go to My learning</a> to join with a code.
        </p>
      </div>
    )
  }
  const recent = recentResults(data)
  const avg = averageScore(data)
  return (
    <>
      <section aria-label="Summary">
        <dl className="lo-summary">
          <Stat label="Courses" value={String(data.totals.cohorts)} />
          <Stat
            label="Items completed"
            value={`${data.totals.itemsDone} of ${data.totals.itemsTotal}`}
          />
          <Stat
            label="Average score"
            value={scoreText(avg)}
            note={
              avg === null
                ? 'Nothing scored yet'
                : 'Average of your best score on each scored item. Pre-checks and reviews are not counted.'
            }
          />
          <Stat
            label="Attempts"
            value={String(data.totals.attempts)}
            note="Attempts on scored items"
          />
          <Stat label="Interview ready" value={readinessSummary(data)} />
        </dl>
      </section>

      <h2 className="lo-h2">Your courses</h2>
      <ul className="lo-cards">
        {data.cohorts.map((c) => (
          <CohortCard key={c.cohortId} c={c} />
        ))}
      </ul>

      <h2 className="lo-h2">Recent results</h2>
      {recent.length === 0 ? (
        <p className="dash-muted">Nothing completed yet.</p>
      ) : (
        <ol className="lo-timeline">
          {recent.map((r) => (
            <li key={`${r.cohortId}-${r.itemId}`}>
              <time dateTime={r.at}>{dateShort(r.at)}</time>
              <span>
                <a href={href(`/lms/learning/${r.cohortId}/${r.itemId}`)}>{r.title}</a>
                <span className="lo-note">
                  {' '}
                  · {r.courseTitle} ·{' '}
                  {r.score === null ? 'Completed' : `Score ${scoreText(r.score)}`}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

/** #69 A: the learner's own outcomes across every cohort. Mounted at /lms/learning/outcomes. */
export function LearnerOutcomesPage() {
  const { href } = useApp()
  const { data, error, loading, reload } = useLoad<LearnerOutcomes>('/learn/me/outcomes')
  return (
    <div className="lo">
      <p className="dash-sub">
        <a href={href('/lms/learning')}>← My learning</a>
      </p>
      <h1 className="dash-h2">My outcomes</h1>
      <p className="dash-sub">Your progress, scores and skills across all of your courses.</p>
      {error ? (
        <div role="alert" className="lo-error">
          <p className="dash-error">
            Your outcomes could not be loaded. Check your connection and try again in a moment.
          </p>
          <button type="button" className="dash-btn" onClick={reload}>
            Try again
          </button>
        </div>
      ) : loading || !data ? (
        <p className="dash-loading">Loading your outcomes…</p>
      ) : (
        <Content data={data} />
      )}
    </div>
  )
}
