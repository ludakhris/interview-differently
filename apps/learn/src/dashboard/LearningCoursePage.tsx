import type { LearnerAddedItem, LearnerOutline, ReadinessRecord } from '@id/types'
import { Fragment } from 'react'
import { useLoad } from './api'
import { useApp } from './app-context'
import { Meter } from './charts'
import { CohortStatusChip } from './CohortsPage'
import { dateOnly, score } from './format'
import { LEARNER_TYPE_LABEL } from './ItemEditor'
import { recordGroups, type RecordShape } from './recordGroups'
import { errorNotice } from './shared'

const STATUS_WORD = { not_started: 'To do', in_progress: 'Started', completed: 'Done' } as const

/** One course for the learner: their progress, their record, and the outline to work through. */
export function LearningCoursePage({ cohortId }: { cohortId: string }) {
  const { href } = useApp()
  const { data, error, loading } = useLoad<LearnerOutline>(`/learn/me/cohorts/${cohortId}`)
  if (error) return errorNotice(error)
  if (loading || !data) return <p className="dash-loading">Loading course…</p>
  const c = data.cohort
  // Each addition is shown right after the check or interview whose result added it. Anything
  // whose trigger is no longer in the course falls back to its own section.
  const inOutline = new Set(data.modules.flatMap((m) => m.items.map((i) => i.id)))
  const addedAfter = (id: string) => data.added.filter((a) => a.reason.sourceItemId === id)
  const orphans = data.added.filter(
    (a) => !a.reason.sourceItemId || !inOutline.has(a.reason.sourceItemId)
  )
  const locked = c.status === 'upcoming' ? `Starts ${dateOnly(c.startsAt)}.` : null

  return (
    <>
      <p className="dash-back">
        <a href={href('/lms/learning')}>← My learning</a>
      </p>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">{c.courseTitle}</h1>
          <p className="dash-sub">
            {c.cohortName} · {c.host} · {dateOnly(c.startsAt)} to {dateOnly(c.endsAt)}
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
          <p className="dash-muted" data-testid="progress-count">
            {c.itemsDone} of {c.itemsTotal} items
            {data.added.length > 0 ? `, including ${data.added.length} added to your plan` : ''}
          </p>
          <ol className="dash-modules dash-learner-modules">
            {data.modules.map((m) => (
              <li key={m.id} className="dash-card">
                <h3 className="dash-learner-module">{m.title}</h3>
                <ol className="dash-items">
                  {m.items.map((i) => (
                    <Fragment key={i.id}>
                      <li className="dash-item">
                        <a
                          className="dash-item-link"
                          href={href(`/lms/learning/${cohortId}/${i.id}`)}
                        >
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
                      {addedAfter(i.id).length > 0 && (
                        <li className="dash-plan-after">
                          <AddedList items={addedAfter(i.id)} cohortId={cohortId} />
                        </li>
                      )}
                    </Fragment>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
          {orphans.length > 0 && (
            <section className="dash-card" aria-labelledby="h-added">
              <h3 className="dash-learner-module" id="h-added">
                Added for you
              </h3>
              <AddedList items={orphans} cohortId={cohortId} />
            </section>
          )}
        </section>

        <aside>
          <RecordCard
            record={data.record}
            shape={{
              hasPre: data.modules.some((m) => m.items.some((i) => i.label === 'pre')),
              hasPost: data.modules.some((m) => m.items.some((i) => i.label === 'post')),
            }}
          />
        </aside>
      </div>
    </>
  )
}

/**
 * Items a learner's results added to their plan, as rows like any other in the course, marked
 * with a short chip and the reason inside the row.
 */
function AddedList({ items, cohortId }: { items: LearnerAddedItem[]; cohortId: string }) {
  const { href } = useApp()
  return (
    <ol className="dash-items dash-plan-rows">
      {items.map((i) => {
        const done = i.status === 'completed'
        return (
          <li key={i.id} className="dash-item dash-item-added">
            <a className="dash-item-link" href={href(`/lms/learning/${cohortId}/${i.id}`)}>
              <span className="dash-item-type">
                {LEARNER_TYPE_LABEL[i.type] ?? i.type}
                <span className="dash-item-tag">
                  <span className="dash-chip">{i.review ? 'Review' : 'Added'}</span>
                </span>
              </span>
              <span className="dash-item-title">
                {i.title}
                <span className="dash-plan-why">
                  Because your {i.reason.skill} result was {i.reason.pct}%.
                  {i.review && !done ? ' You did this before; do it again.' : ''}
                </span>
              </span>
              <span className={done ? 'dash-item-status dash-item-done' : 'dash-item-status'}>
                {done ? 'Done' : i.review ? 'To redo' : 'To do'}
              </span>
            </a>
          </li>
        )
      })}
    </ol>
  )
}

/** The learner's own readiness record: the same measures their agency reports on. */
export function RecordCard({ record, shape }: { record: ReadinessRecord; shape?: RecordShape }) {
  return (
    <div className="dash-card dash-record">
      <h2 className="dash-card-title">Your readiness record</h2>
      {recordGroups(record, shape).map((g, n) => (
        <Fragment key={g.heading ?? `rows-${n}`}>
          {g.heading && <h3 className="dash-record-sub">{g.heading}</h3>}
          <dl className="dash-record-rows">
            {g.rows.map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd className={r.yes ? 'dash-record-yes' : ''}>{r.value}</dd>
              </div>
            ))}
          </dl>
        </Fragment>
      ))}
      <p className="dash-muted dash-record-note">
        Your instructor and training provider see this record.
      </p>
    </div>
  )
}
