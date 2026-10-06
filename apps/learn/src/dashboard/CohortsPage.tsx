import type { CohortDetail, CohortListItem, RunnableCourse } from '@id/types'
import { useState, type FormEvent } from 'react'
import { useApiSend, useLoad } from './api'
import { useApp } from './app-context'
import { dateShort } from './format'
import { errorNotice } from './shared'

const STATUS_LABEL = { upcoming: 'Upcoming', running: 'Running', completed: 'Completed' } as const

export function CohortStatusChip({ status }: { status: keyof typeof STATUS_LABEL }) {
  return (
    <span className={status === 'running' ? 'dash-chip dash-chip-on' : 'dash-chip'}>
      {STATUS_LABEL[status]}
    </span>
  )
}

const addWeeks = (iso: string, weeks: number): string | null => {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null // a date still being typed
  d.setUTCDate(d.getUTCDate() + weeks * 7)
  return d.toISOString()
}

/** Cohorts a workspace runs, with a form to start a new one. */
export function CohortsPage({ workspace }: { workspace: string }) {
  const { href, current } = useApp()
  const base = `/learn/workspaces/${encodeURIComponent(workspace)}`
  const cohorts = useLoad<CohortListItem[]>(`${base}/cohorts`)
  const courses = useLoad<RunnableCourse[]>(`${base}/runnable-courses`)
  const send = useApiSend()
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [courseId, setCourseId] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [maxLearners, setMaxLearners] = useState('')

  const course = courses.data?.find((c) => c.id === courseId) ?? null
  const suggested = course && startsAt ? `${course.title} ${startsAt.slice(0, 4)}` : ''
  const shownName = nameTouched ? name : suggested
  const endIso = course?.lengthWeeks && startsAt ? addWeeks(startsAt, course.lengthWeeks) : null
  const endText = endIso ? dateShort(endIso) : ''

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError(null)
    try {
      const created = await send<CohortDetail>('POST', `${base}/cohorts`, {
        courseId,
        startsAt,
        name: shownName,
        maxLearners: maxLearners.trim() ? Number(maxLearners) : null,
      })
      window.location.assign(href(`/cohorts/${created.id}`))
    } catch (err) {
      setFormError((err as Error).message)
      setBusy(false)
    }
  }

  if (cohorts.error) return errorNotice(cohorts.error)
  if (cohorts.loading || !cohorts.data) return <p className="dash-loading">Loading cohorts…</p>
  const noCourses = courses.data?.length === 0

  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">Cohorts</h1>
          <p className="dash-sub">
            {current?.name}. A cohort is one course, one roster and one start date, for the
            course&apos;s full length.
          </p>
        </div>
        {!creating && (
          <button type="button" className="dash-btn" onClick={() => setCreating(true)}>
            New cohort
          </button>
        )}
      </div>

      {creating && (
        <form className="dash-card dash-form" onSubmit={create}>
          <h2 className="dash-card-title">New cohort</h2>
          {noCourses ? (
            <p className="dash-muted">
              No published courses are available to this workspace yet. Publish a course, or ask a
              provider to offer you one.
            </p>
          ) : (
            <>
              <div className="dash-field-row">
                <label className="dash-field">
                  <span>Course</span>
                  <select value={courseId} required onChange={(e) => setCourseId(e.target.value)}>
                    <option value="">Choose…</option>
                    {courses.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.provider})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="dash-field">
                  <span>Start date</span>
                  <input
                    type="date"
                    required
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </label>
              </div>
              <div className="dash-field-row">
                <label className="dash-field">
                  <span>End date</span>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={endText}
                    placeholder="Set by the course length"
                  />
                  <small className="dash-muted">
                    {course && !course.lengthWeeks
                      ? 'This course has no length yet. Set it in the course settings first.'
                      : 'A cohort lasts as long as its course. The end date follows the start date.'}
                  </small>
                </label>
                <label className="dash-field">
                  <span>Maximum learners</span>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={maxLearners}
                    onChange={(e) => setMaxLearners(e.target.value)}
                    placeholder="No limit"
                  />
                  <small className="dash-muted">
                    Leave blank for no limit. Once full, the join code stops working.
                  </small>
                </label>
              </div>
              <label className="dash-field">
                <span>Cohort name</span>
                <input
                  required
                  maxLength={120}
                  value={shownName}
                  onChange={(e) => {
                    setNameTouched(true)
                    setName(e.target.value)
                  }}
                />
              </label>
            </>
          )}
          {formError && <p className="dash-error">{formError}</p>}
          <div className="dash-form-actions">
            {!noCourses && (
              <button
                type="submit"
                className="dash-btn"
                disabled={busy || !course?.lengthWeeks || !shownName}
              >
                {busy ? 'Creating…' : 'Create cohort'}
              </button>
            )}
            <button type="button" className="dash-btn-quiet" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {cohorts.data.length === 0 && !creating ? (
        <div className="dash-empty">
          <h2 className="dash-card-title">No cohorts yet</h2>
          <p>Create one to get a join code you can share with learners.</p>
        </div>
      ) : (
        <ul className="dash-courselist">
          {cohorts.data.map((c) => (
            <li key={c.id} className="dash-card dash-course">
              <div className="dash-course-main">
                <a className="dash-course-title" href={href(`/cohorts/${c.id}`)}>
                  {c.name}
                </a>
                <p className="dash-sub">
                  {c.courseTitle} · {dateShort(c.startsAt)} to {dateShort(c.endsAt)}
                </p>
              </div>
              <dl className="dash-course-stats">
                <div>
                  <dt>Learners</dt>
                  <dd>
                    {c.enrolled}
                    {c.maxLearners !== null && (
                      <span className="dash-muted"> / {c.maxLearners}</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Join code</dt>
                  <dd className="dash-code">{c.joinKey ?? '—'}</dd>
                </div>
              </dl>
              <div className="dash-course-side">
                <CohortStatusChip status={c.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
