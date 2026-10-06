import type { CourseDetail, CourseSummary } from '@id/types'
import { useState, type FormEvent } from 'react'
import { useApiSend, useLoad } from './api'
import { useApp } from './app-context'
import { dateShort } from './format'
import { errorNotice } from './shared'

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={status === 'published' ? 'dash-chip dash-chip-on' : 'dash-chip'}>
      {status === 'published' ? 'Published' : 'Draft'}
    </span>
  )
}

/** A provider's courses, with a form to start a new one. */
export function CoursesPage({ workspace }: { workspace: string }) {
  const { href, current } = useApp()
  const { data, error, loading } = useLoad<CourseSummary[]>(
    `/learn/workspaces/${encodeURIComponent(workspace)}/courses`
  )
  const send = useApiSend()
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const weeks = Number(f.get('lengthWeeks'))
    setBusy(true)
    setFormError(null)
    try {
      const course = await send<CourseDetail>(
        'POST',
        `/learn/workspaces/${encodeURIComponent(workspace)}/courses`,
        {
          title: f.get('title'),
          sector: f.get('sector'),
          credential: f.get('credential'),
          ...(weeks ? { lengthWeeks: weeks } : {}),
        }
      )
      window.location.assign(href(`/lms/courses/${course.id}`))
    } catch (err) {
      setFormError((err as Error).message)
      setBusy(false)
    }
  }

  if (error) return errorNotice(error)
  if (loading || !data) return <p className="dash-loading">Loading courses…</p>

  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">Courses</h1>
          <p className="dash-sub">
            {current?.name}. Build a course once, then run it as many cohorts as you like.
          </p>
        </div>
        {!creating && (
          <button type="button" className="dash-btn" onClick={() => setCreating(true)}>
            New course
          </button>
        )}
      </div>

      {creating && (
        <form className="dash-card dash-form" onSubmit={create}>
          <h2 className="dash-card-title">New course</h2>
          <label className="dash-field">
            <span>Course title</span>
            <input
              name="title"
              required
              maxLength={120}
              autoFocus
              placeholder="Medical Assistant"
            />
          </label>
          <div className="dash-field-row">
            <label className="dash-field">
              <span>Sector</span>
              <input name="sector" maxLength={60} placeholder="Healthcare" />
            </label>
            <label className="dash-field">
              <span>Credential</span>
              <input name="credential" maxLength={80} placeholder="CCMA" />
            </label>
            <label className="dash-field">
              <span>Length (weeks)</span>
              <input name="lengthWeeks" type="number" min={1} max={104} placeholder="16" />
            </label>
          </div>
          {formError && <p className="dash-error">{formError}</p>}
          <div className="dash-form-actions">
            <button type="submit" className="dash-btn" disabled={busy}>
              {busy ? 'Creating…' : 'Create and open'}
            </button>
            <button type="button" className="dash-btn-quiet" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {data.length === 0 && !creating ? (
        <div className="dash-empty">
          <h2 className="dash-card-title">No courses yet</h2>
          <p>Start with a title. You will add modules, lessons and assessments next.</p>
        </div>
      ) : (
        <ul className="dash-courselist">
          {data.map((c) => (
            <li key={c.id} className="dash-card dash-course">
              <div className="dash-course-main">
                <a className="dash-course-title" href={href(`/lms/courses/${c.id}`)}>
                  {c.title}
                </a>
                <p className="dash-sub">
                  {[c.sector, c.credential, c.lengthWeeks ? `${c.lengthWeeks} weeks` : null]
                    .filter(Boolean)
                    .join(' · ') || 'No details yet'}
                </p>
              </div>
              <dl className="dash-course-stats">
                <div>
                  <dt>Modules</dt>
                  <dd>{c.modules}</dd>
                </div>
                <div>
                  <dt>Items</dt>
                  <dd>{c.items}</dd>
                </div>
                <div>
                  <dt>Cohorts</dt>
                  <dd>{c.cohorts}</dd>
                </div>
              </dl>
              <div className="dash-course-side">
                <StatusChip status={c.status} />
                <span className="dash-muted">Updated {dateShort(c.updatedAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
