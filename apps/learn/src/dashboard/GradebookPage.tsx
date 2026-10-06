import type { Gradebook } from '@id/types'
import { useLoad } from './api'
import { Meter, StatTile } from './charts'
import { dateShort, pct, points, score } from './format'
import { useApp } from './app-context'
import { errorNotice, useRole } from './shared'

export function GradebookPage({ tenant, cohortId }: { tenant: string; cohortId: string }) {
  const { data, error, loading } = useLoad<Gradebook>(
    `/learn/agency/cohorts/${encodeURIComponent(cohortId)}/gradebook?tenant=${encodeURIComponent(tenant)}`
  )
  const role = useRole()
  if (error) return errorNotice(error)
  if (loading || !data) return <p className="dash-loading">Loading gradebook…</p>
  return <GradebookView data={data} role={role} />
}

export function GradebookView({ data, role }: { data: Gradebook; role?: string }) {
  const { href } = useApp()
  const c = data.cohort
  return (
    <>
      <p className="dash-back">
        <a href={href('/lms/dashboard')}>← All cohorts</a>
      </p>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">{c.cohort}</h1>
          <p className="dash-sub">
            {c.provider}
            {c.host !== c.provider ? ` · run by ${c.host}` : ''} · {dateShort(c.startsAt)} to{' '}
            {dateShort(c.endsAt)} · {c.status === 'running' ? 'In progress' : 'Completed'}
          </p>
        </div>
        {role === 'case-manager' && <p className="dash-readonly">Read-only view</p>}
      </div>

      <section aria-label="Cohort measures" className="dash-tiles">
        <StatTile label="Enrolled" value={String(c.enrolled)} />
        <StatTile
          label="Completed"
          value={String(c.completed)}
          note={c.status === 'running' ? 'Cohort still running' : pct(c.completionRate)}
        />
        <StatTile
          label="Reached target score"
          value={String(c.reachedTarget)}
          note={`Post-assessment ${c.targetScore} or higher. Average score ${score(c.avgPre)} → ${score(c.avgPost)}`}
        />
        <StatTile
          label="Interview ready"
          value={String(c.interviewReady)}
          note={`Best interview ${c.readinessThreshold} or higher`}
        />
      </section>

      <section className="dash-section" aria-label="Learners">
        <div className="dash-tablewrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th scope="col">Learner</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  Pre
                </th>
                <th scope="col" className="num">
                  Post
                </th>
                <th scope="col" className="num">
                  Change (% points)
                </th>
                <th scope="col">Target score</th>
                <th scope="col" className="num">
                  Best interview
                </th>
                <th scope="col">Readiness</th>
                <th scope="col">Course progress</th>
                <th scope="col">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {data.learners.map((l) => (
                <tr key={l.enrollmentId}>
                  <th scope="row">{l.name}</th>
                  <td>
                    {l.status === 'completed'
                      ? 'Completed'
                      : l.status === 'withdrawn'
                        ? 'Withdrawn'
                        : 'Enrolled'}
                  </td>
                  <td className="num">{score(l.pre)}</td>
                  <td className="num">{score(l.post)}</td>
                  <td className="num">{points(l.gain)}</td>
                  <td>
                    {l.reachedTarget ? (
                      <span className="dash-pill dash-pill-ready">Met</span>
                    ) : l.post !== null ? (
                      <span className="dash-pill">Not met</span>
                    ) : (
                      <span className="dash-muted">—</span>
                    )}
                  </td>
                  <td className="num">
                    {score(l.interviewBest)}
                    {l.interviewAttempts > 0 && (
                      <span className="dash-muted"> ({l.interviewAttempts})</span>
                    )}
                  </td>
                  <td>
                    {l.interviewReady ? (
                      <span className="dash-pill dash-pill-ready">Ready</span>
                    ) : l.interviewBest !== null ? (
                      <span className="dash-pill">Not yet</span>
                    ) : (
                      <span className="dash-muted">No attempt</span>
                    )}
                  </td>
                  <td>
                    <Meter
                      value={l.itemsTotal ? l.itemsDone / l.itemsTotal : null}
                      label="Course progress"
                    />
                  </td>
                  <td>{dateShort(l.lastActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="dash-sub">
          Interview attempts in brackets. Sample data for fictional participants.
        </p>
      </section>
    </>
  )
}
