import type { LearnerAddedItem, LearnerOutline, ReadinessRecord } from '@id/types'
import { Fragment, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useLoad } from './api'
import { useApp } from './app-context'
import { Meter } from './charts'
import { CohortStatusChip } from './CohortsPage'
import { dateOnly, score } from './format'
import { LearnerAttendanceLine } from './attendance/LearnerAttendanceLine'
import { LEARNER_TYPE_LABEL } from './ItemEditor'
import { recordGroups, type RecordShape } from './recordGroups'
import { resumeItem } from './resume'
import { errorNotice } from './shared'
import {
  diffPaths,
  loadSnapshot,
  outlineSnapshot,
  saveSnapshot,
  type PathDiff,
} from './adaptive/planDiff'
import './adaptive/adaptive.css'
import { ProvenChip } from './adaptive/ProvenChip'

const STATUS_WORD = { not_started: 'To do', in_progress: 'Started', completed: 'Done' } as const

/** One course for the learner: their progress, their record, and the outline to work through. */
export function LearningCoursePage({ cohortId }: { cohortId: string }) {
  const { href } = useApp()
  const { data, error, loading } = useLoad<LearnerOutline>(`/learn/me/cohorts/${cohortId}`)
  // Adaptive checkpoints: what changed in the path since this browser last showed it, to animate it.
  const key = `ld-path:${cohortId}`
  const before = useRef<ReturnType<typeof loadSnapshot> | undefined>(undefined)
  if (before.current === undefined && data) before.current = loadSnapshot(key)
  const diff = useMemo<PathDiff | null>(
    () => (data ? diffPaths(before.current ?? null, outlineSnapshot(data)) : null),
    [data]
  )
  useEffect(() => {
    if (data) saveSnapshot(key, outlineSnapshot(data))
  }, [data, key])
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
  const skippedCount = data.modules.reduce((n, m) => n + m.items.filter((i) => i.skipped).length, 0)
  const order = data.modules.flatMap((m) => m.items.map((i) => i.id))
  const delay = (id: string): CSSProperties =>
    ({ '--ad-delay': `${0.4 + Math.max(0, order.indexOf(id)) * 0.12}s` }) as CSSProperties
  const newlySkipped = diff?.skipped.size ?? 0
  const newlyAdded = diff?.entered.size ?? 0
  const resume = locked ? null : resumeItem(data)

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

      {(newlySkipped > 0 || newlyAdded > 0) && (
        <div className="ad ad-changed-banner" role="status">
          <strong>Your path changed since you were last here</strong>
          {newlySkipped > 0 && (
            <ProvenChip>
              {newlySkipped} proven: you have shown {newlySkipped === 1 ? 'it' : 'them'}
            </ProvenChip>
          )}
          {newlyAdded > 0 && (
            <span className="ad-chip ad-chip-add">{newlyAdded} added to help</span>
          )}
          <span className="ad-count">{c.itemsTotal} items on your path now</span>
        </div>
      )}

      <div className="dash-learner-grid ad">
        <section aria-labelledby="h-outline">
          <div className="dash-course-head dash-mycourse-head">
            <h2 className="dash-card-title" id="h-outline">
              Your course progress
            </h2>
            <Meter value={c.itemsTotal ? c.itemsDone / c.itemsTotal : null} label="Progress" />
            <p className="dash-muted" data-testid="progress-count">
              {c.itemsDone} of {c.itemsTotal} items
              {data.added.length > 0 ? `, including ${data.added.length} added to your plan` : ''}
              {skippedCount > 0 ? `. ${skippedCount} proven through course performance.` : ''}
            </p>
            <LearnerAttendanceLine cohortId={cohortId} />
            <p className="dash-muted" data-testid="activity-notice">
              We record how long you spend active in this course, to report to our funders. We do
              not record what you type.
            </p>
          </div>
          {(skippedCount > 0 || data.added.length > 0) && (
            <p className="ad-legend" aria-label="What the markers mean">
              <span className="ad-chip ad-chip-add">+ Added based on your course performance</span>
              <ProvenChip>Proven through course performance</ProvenChip>
            </p>
          )}
          <ol className="dash-modules dash-learner-modules">
            {data.modules.map((m) => (
              <li key={m.id} className="dash-card">
                <h3 className="dash-learner-module">{m.title}</h3>
                <ol className="dash-items">
                  {m.items.map((i) => (
                    <Fragment key={i.id}>
                      <li
                        className={[
                          'dash-item ad-row',
                          i.skipped ? 'is-skipped' : '',
                          resume?.item.id === i.id ? 'is-next' : '',
                          diff?.skipped.has(i.id) ? 'is-skipping' : '',
                          diff?.changed.has(i.id) ? 'is-changed' : '',
                        ].join(' ')}
                        style={delay(i.id)}
                      >
                        <a
                          className="dash-item-link"
                          href={href(`/lms/learning/${cohortId}/${i.id}`)}
                        >
                          <span className="dash-item-type">
                            {i.checkpoint ? 'Checkpoint' : (LEARNER_TYPE_LABEL[i.type] ?? i.type)}
                            {i.label ? ` · ${i.label}` : ''}
                          </span>
                          <span className="dash-item-title">
                            <span className="ad-row-title">{i.title}</span>
                            {i.note && <span className="dash-plan-why">{i.note}</span>}
                            {i.skipped && (
                              <span className="dash-plan-why">
                                <ProvenChip>Proven</ProvenChip> You showed {i.skipped.skill} (
                                {i.skipped.pct}%). Open it any time to review.
                              </span>
                            )}
                          </span>
                          <span
                            className={
                              i.status === 'completed'
                                ? 'dash-item-status dash-item-done'
                                : 'dash-item-status'
                            }
                          >
                            {i.skipped
                              ? 'Not needed'
                              : resume?.item.id === i.id
                                ? 'Up next'
                                : STATUS_WORD[i.status]}
                            {!i.skipped && i.status === 'completed' && i.score !== null
                              ? ` · ${score(i.score)}`
                              : ''}
                          </span>
                        </a>
                      </li>
                      {addedAfter(i.id).length > 0 && (
                        <li className="dash-plan-after">
                          <AddedList
                            items={addedAfter(i.id)}
                            cohortId={cohortId}
                            diff={diff}
                            nextId={resume?.item.id}
                          />
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
              <AddedList items={orphans} cohortId={cohortId} diff={diff} nextId={resume?.item.id} />
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
          {resume && (
            <a
              className="dash-btn dash-resume"
              href={href(`/lms/learning/${cohortId}/${resume.item.id}`)}
            >
              <span aria-hidden="true">🚀</span> {resume.started ? 'Continue' : 'Start'}:{' '}
              {resume.item.title} →
            </a>
          )}
        </aside>
      </div>
    </>
  )
}

/**
 * Items a learner's results added to their plan, as rows like any other in the course, marked
 * with a short chip and the reason inside the row.
 */
function AddedList({
  items,
  cohortId,
  diff,
  nextId,
}: {
  items: LearnerAddedItem[]
  cohortId: string
  diff: PathDiff | null
  /** The item the learner picks up next, marked "Up next". */
  nextId: string | undefined
}) {
  const { href } = useApp()
  return (
    <ol className="dash-items dash-plan-rows">
      {items.map((i, n) => {
        const done = i.status === 'completed'
        const entering = diff?.entered.has(`added:${i.id}`)
        // Help for a gap the learner has since closed: optional review now.
        if (i.skipped)
          return (
            <li
              key={i.id}
              className={`dash-item dash-item-added ad-row is-skipped${diff?.skipped.has(`added:${i.id}`) ? ' is-skipping' : ''}`}
            >
              <a className="dash-item-link" href={href(`/lms/learning/${cohortId}/${i.id}`)}>
                <span className="dash-item-type">
                  {i.checkpoint ? 'Checkpoint' : (LEARNER_TYPE_LABEL[i.type] ?? i.type)}
                </span>
                <span className="dash-item-title">
                  <span className="ad-row-title">{i.title}</span>
                  <span className="dash-plan-why">
                    <span className="ad-chip ad-chip-skip">Optional</span> You closed this gap:{' '}
                    {i.skipped.skill} ({i.skipped.pct}%). Open it any time to review.
                  </span>
                </span>
                <span className="dash-item-status">Not needed</span>
              </a>
            </li>
          )
        return (
          <li
            key={i.id}
            className={`dash-item dash-item-added ad-row${entering ? ' is-entering' : ''}${i.id === nextId ? ' is-next' : ''}`}
            style={{ '--ad-delay': `${0.8 + n * 0.2}s` } as CSSProperties}
          >
            <a className="dash-item-link" href={href(`/lms/learning/${cohortId}/${i.id}`)}>
              <span className="dash-item-type">
                {i.checkpoint ? 'Checkpoint' : (LEARNER_TYPE_LABEL[i.type] ?? i.type)}
                <span className="dash-item-tag">
                  <span className="dash-chip dash-chip-added">
                    {i.review ? '↺ Review' : '+ Added'}
                  </span>
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
                {done ? 'Done' : i.id === nextId ? 'Up next' : i.review ? 'To redo' : 'To do'}
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
