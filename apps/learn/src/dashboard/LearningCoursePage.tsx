import type { LearnerOutline, ReadinessRecord } from '@id/types'
import { useLoad } from './api'
import { useApp } from './app-context'
import { Meter } from './charts'
import { CohortStatusChip } from './CohortsPage'
import { dateShort, points, score } from './format'
import { LEARNER_TYPE_LABEL } from './ItemEditor'
import { errorNotice } from './shared'

const STATUS_WORD = { not_started: 'To do', in_progress: 'Started', completed: 'Done' } as const

/** One course for the learner: their progress, their record, and the outline to work through. */
export function LearningCoursePage({ cohortId }: { cohortId: string }) {
  const { href } = useApp()
  const { data, error, loading } = useLoad<LearnerOutline>(`/learn/me/cohorts/${cohortId}`)
  if (error) return errorNotice(error)
  if (loading || !data) return <p className="dash-loading">Loading course…</p>
  const c = data.cohort
  const locked = c.status === 'upcoming' ? `Starts ${dateShort(c.startsAt)}.` : null

  return (
    <>
      <p className="dash-back">
        <a href={href('/learning')}>← My learning</a>
      </p>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">{c.courseTitle}</h1>
          <p className="dash-sub">
            {c.cohortName} · {c.host} · {dateShort(c.startsAt)} to {dateShort(c.endsAt)}
          </p>
        </div>
        <div className="dash-actions">
          <CohortStatusChip status={c.status} />
          {c.enrollmentStatus === 'completed' && (
            <span className="dash-chip dash-chip-on">Completed</span>
          )}
        </div>
      </div>
      {locked && (
        <p className="dash-banner">{locked} You can look around, and start when it opens.</p>
      )}

      <div className="dash-learner-grid">
        <section aria-labelledby="h-outline">
          <h2 className="dash-card-title" id="h-outline">
            Your course
          </h2>
          <Meter value={c.itemsTotal ? c.itemsDone / c.itemsTotal : null} label="Progress" />
          <ol className="dash-modules dash-learner-modules">
            {data.modules.map((m) => (
              <li key={m.id} className="dash-card">
                <h3 className="dash-learner-module">{m.title}</h3>
                <ol className="dash-items">
                  {m.items.map((i) => (
                    <li key={i.id} className="dash-item">
                      <a className="dash-item-link" href={href(`/learning/${cohortId}/${i.id}`)}>
                        <span className="dash-item-type">
                          {LEARNER_TYPE_LABEL[i.type] ?? i.type}
                          {i.label ? ` · ${i.label}` : ''}
                        </span>
                        <span className="dash-item-title">{i.title}</span>
                        <span
                          className={
                            i.status === 'completed'
                              ? 'dash-item-status dash-item-done'
                              : 'dash-item-status'
                          }
                        >
                          {STATUS_WORD[i.status]}
                          {i.status === 'completed' && i.score !== null
                            ? ` · ${score(i.score)}`
                            : ''}
                        </span>
                      </a>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        </section>

        <aside>
          <RecordCard record={data.record} />
        </aside>
      </div>
    </>
  )
}

/** The learner's own readiness record: the same measures their agency reports on. */
export function RecordCard({ record }: { record: ReadinessRecord }) {
  const rows: [string, string][] = [
    ['Pre-assessment', score(record.pre)],
    ['Post-assessment', score(record.post)],
    ['Change', record.gain === null ? '—' : `${points(record.gain)} % points`],
    ['Course target', `${record.targetScore}%`],
    ['Practice interview, best', score(record.interviewBest)],
  ]
  return (
    <div className="dash-card dash-record">
      <h2 className="dash-card-title">Your readiness record</h2>
      <dl className="dash-record-rows">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div>
          <dt>Target score</dt>
          <dd className={record.reachedTarget ? 'dash-record-yes' : ''}>
            {record.reachedTarget
              ? 'Reached'
              : record.post === null
                ? 'Not yet taken'
                : 'Not reached'}
          </dd>
        </div>
        <div>
          <dt>Interview readiness</dt>
          <dd className={record.interviewReady ? 'dash-record-yes' : ''}>
            {record.interviewReady
              ? 'Ready to interview'
              : record.interviewBest === null
                ? 'Not yet scored'
                : 'Keep practicing'}
          </dd>
        </div>
        <div>
          <dt>Course</dt>
          <dd className={record.completed ? 'dash-record-yes' : ''}>
            {record.completed ? 'Completed' : 'In progress'}
          </dd>
        </div>
      </dl>
      <p className="dash-muted dash-record-note">
        Your instructor and training provider see this record. Sample content only.
      </p>
    </div>
  )
}
