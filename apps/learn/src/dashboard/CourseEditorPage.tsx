import type {
  CourseDetail,
  CourseItemType,
  CourseModuleDto,
  CourseOffers,
  CourseOutline,
} from '@id/types'
import { useEffect, useState, type FormEvent } from 'react'
import { useApiFetch, useApiSend, useLoad } from './api'
import { useApp } from './app-context'
import { StatusChip } from './CoursesPage'
import { ItemEditor, TYPE_LABEL, type ItemDraft } from './ItemEditor'
import { errorNotice } from './shared'

const ADD_TYPES: { type: CourseItemType; label: string; title: string }[] = [
  { type: 'lesson', label: 'Lesson', title: 'New lesson' },
  { type: 'knowledge_check', label: 'Knowledge check', title: 'New knowledge check' },
  { type: 'assessment', label: 'Assessment', title: 'New assessment' },
  { type: 'interview', label: 'Practice interview', title: 'Practice interview' },
]

/** Lines of a textarea as a list, blanks dropped. */
const asLines = (v: FormDataEntryValue | null): string[] =>
  String(v ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

/** Moves `id` one place within `ids`. */
function shift(ids: string[], id: string, by: -1 | 1): string[] {
  const i = ids.indexOf(id)
  const j = i + by
  if (i < 0 || j < 0 || j >= ids.length) return ids
  const next = [...ids]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

const outlineOf = (modules: CourseModuleDto[]): CourseOutline => ({
  moduleIds: modules.map((m) => m.id),
  itemIds: Object.fromEntries(modules.map((m) => [m.id, m.items.map((i) => i.id)])),
})

export function CourseEditorPage({ courseId }: { courseId: string }) {
  const { data, error, loading } = useLoad<CourseDetail>(`/learn/courses/${courseId}`)
  const [course, setCourse] = useState<CourseDetail | null>(null)
  useEffect(() => {
    if (data) setCourse(data)
  }, [data])
  if (error) return errorNotice(error)
  if (loading || !course) return <p className="dash-loading">Loading course…</p>
  return (
    <>
      <Editor course={course} onChange={setCourse} />
      <OffersPanel courseId={course.id} />
    </>
  )
}

function Editor({
  course,
  onChange,
}: {
  course: CourseDetail
  onChange: (c: CourseDetail) => void
}) {
  const { href } = useApp()
  const send = useApiSend()
  const apiFetch = useApiFetch()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [editingItem, setEditingItem] = useState<string | null>(null)

  /** Runs a change; shows the server's message if it is refused. */
  async function run(action: () => Promise<CourseDetail | void>, ok?: string) {
    setBusy(true)
    setMessage(null)
    try {
      const next = await action()
      if (next) onChange(next)
      if (ok) setMessage({ kind: 'ok', text: ok })
      return true
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message })
      return false
    } finally {
      setBusy(false)
    }
  }

  async function saveSettings(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const weeks = String(f.get('lengthWeeks') ?? '').trim()
    await run(
      () =>
        send<CourseDetail>('PUT', `/learn/courses/${course.id}`, {
          title: f.get('title'),
          summary: f.get('summary'),
          sector: f.get('sector'),
          credential: f.get('credential'),
          lengthWeeks: weeks ? Number(weeks) : null,
          targetScore: Number(f.get('targetScore')),
          readinessThreshold: Number(f.get('readinessThreshold')),
          outcomes: asLines(f.get('outcomes')),
          targetRoles: asLines(f.get('targetRoles')),
        }),
      'Settings saved.'
    )
  }

  const setStatus = (status: 'draft' | 'published') =>
    run(
      () => send<CourseDetail>('PUT', `/learn/courses/${course.id}`, { status }),
      status === 'published' ? 'Course published.' : 'Course moved back to draft.'
    )

  const reorder = (outline: CourseOutline) =>
    run(() => send<CourseDetail>('PUT', `/learn/courses/${course.id}/outline`, outline))

  const moveModule = (id: string, by: -1 | 1) => {
    const o = outlineOf(course.modules)
    reorder({ ...o, moduleIds: shift(o.moduleIds, id, by) })
  }
  const moveItem = (moduleId: string, id: string, by: -1 | 1) => {
    const o = outlineOf(course.modules)
    reorder({ ...o, itemIds: { ...o.itemIds, [moduleId]: shift(o.itemIds[moduleId], id, by) } })
  }

  const addModule = () =>
    run(() =>
      send<CourseDetail>('POST', `/learn/courses/${course.id}/modules`, {
        title: `Module ${course.modules.length + 1}`,
      })
    )

  const renameModule = (id: string, title: string, current: string) => {
    if (title.trim() && title !== current) {
      void run(() => send<CourseDetail>('PUT', `/learn/modules/${id}`, { title }))
    }
  }

  const removeModule = (m: CourseModuleDto) => {
    if (window.confirm(`Delete "${m.title}" and its ${m.items.length} items?`)) {
      void run(() => send<CourseDetail>('DELETE', `/learn/modules/${m.id}`))
    }
  }

  async function addItem(moduleId: string, kind: (typeof ADD_TYPES)[number]) {
    const before = new Set(course.modules.flatMap((m) => m.items.map((i) => i.id)))
    let created: string | null = null
    const ok = await run(async () => {
      const next = await send<CourseDetail>('POST', `/learn/modules/${moduleId}/items`, {
        type: kind.type,
        title: kind.title,
        ...(kind.type === 'assessment' ? { label: 'pre' } : {}),
      })
      created = next.modules.flatMap((m) => m.items).find((i) => !before.has(i.id))?.id ?? null
      return next
    })
    if (ok && created) setEditingItem(created)
  }

  /** Upload a SCORM zip into a module; the server checks it before keeping anything. */
  async function uploadScorm(moduleId: string, file: File) {
    const before = new Set(course.modules.flatMap((m) => m.items.map((i) => i.id)))
    let created: string | null = null
    const ok = await run(async () => {
      const form = new FormData()
      form.append('file', file)
      const res = await apiFetch(`/learn/modules/${moduleId}/scorm`, { method: 'POST', body: form })
      const next = (await res.json()) as CourseDetail
      created = next.modules.flatMap((m) => m.items).find((i) => !before.has(i.id))?.id ?? null
      return next
    }, 'Package uploaded.')
    if (ok && created) setEditingItem(created)
  }

  async function saveItem(id: string, draft: ItemDraft) {
    const ok = await run(
      () => send<CourseDetail>('PUT', `/learn/items/${id}`, draft),
      'Item saved.'
    )
    if (ok) setEditingItem(null)
  }

  const removeItem = (id: string, title: string) => {
    if (window.confirm(`Delete "${title}"?`)) {
      void run(() => send<CourseDetail>('DELETE', `/learn/items/${id}`))
    }
  }

  async function deleteCourse() {
    if (!window.confirm(`Delete the course "${course.title}"? This cannot be undone.`)) return
    const ok = await run(async () => {
      await send<void>('DELETE', `/learn/courses/${course.id}`)
    })
    if (ok) window.location.assign(href('/courses'))
  }

  const published = course.status === 'published'
  return (
    <>
      <p className="dash-back">
        <a href={href('/courses')}>← All courses</a>
      </p>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">{course.title}</h1>
          <p className="dash-sub">
            {course.provider.name} · {course.cohorts} {course.cohorts === 1 ? 'cohort' : 'cohorts'}
          </p>
        </div>
        <div className="dash-actions">
          <StatusChip status={course.status} />
          <button
            type="button"
            className={published ? 'dash-btn-secondary' : 'dash-btn'}
            disabled={busy}
            onClick={() => setStatus(published ? 'draft' : 'published')}
          >
            {published ? 'Move to draft' : 'Publish'}
          </button>
        </div>
      </div>

      {message && (
        <p
          className={message.kind === 'error' ? 'dash-banner dash-banner-error' : 'dash-banner'}
          role="status"
        >
          {message.text}
        </p>
      )}

      <section className="dash-card" aria-labelledby="h-settings">
        <h2 className="dash-card-title" id="h-settings">
          Course settings
        </h2>
        <form className="dash-form" onSubmit={saveSettings} key={course.title + course.targetScore}>
          <label className="dash-field">
            <span>Title</span>
            <input name="title" required maxLength={120} defaultValue={course.title} />
          </label>
          <label className="dash-field">
            <span>Summary</span>
            <textarea name="summary" rows={2} maxLength={500} defaultValue={course.summary ?? ''} />
          </label>
          <div className="dash-field-row">
            <label className="dash-field">
              <span>What learners will be able to do (one per line)</span>
              <textarea
                name="outcomes"
                rows={5}
                defaultValue={course.outcomes.join('\n')}
                placeholder={'Take and record vital signs accurately\nPrepare patients for an exam'}
              />
              <small className="dash-muted">
                Shown in the catalog. Up to 8, short and concrete.
              </small>
            </label>
            <label className="dash-field">
              <span>Jobs this prepares for (one per line)</span>
              <textarea
                name="targetRoles"
                rows={5}
                defaultValue={course.targetRoles.join('\n')}
                placeholder={'Medical assistant\nClinical assistant'}
              />
              <small className="dash-muted">
                Shown in the catalog so learners can see where it leads.
              </small>
            </label>
          </div>
          <div className="dash-field-row">
            <label className="dash-field">
              <span>Sector</span>
              <input name="sector" maxLength={60} defaultValue={course.sector ?? ''} />
            </label>
            <label className="dash-field">
              <span>Credential</span>
              <input name="credential" maxLength={80} defaultValue={course.credential ?? ''} />
            </label>
            <label className="dash-field">
              <span>Length (weeks)</span>
              <input
                name="lengthWeeks"
                type="number"
                min={1}
                max={104}
                defaultValue={course.lengthWeeks ?? ''}
              />
            </label>
          </div>
          <div className="dash-field-row">
            <label className="dash-field">
              <span>Target score (%)</span>
              <input
                name="targetScore"
                type="number"
                min={0}
                max={100}
                defaultValue={course.targetScore}
              />
              <small className="dash-muted">
                A learner meets the course target with this score or higher on the post-assessment.
              </small>
            </label>
            <label className="dash-field">
              <span>Interview ready at (%)</span>
              <input
                name="readinessThreshold"
                type="number"
                min={0}
                max={100}
                defaultValue={course.readinessThreshold}
              />
              <small className="dash-muted">
                A learner is interview ready with this best practice-interview score or higher.
              </small>
            </label>
          </div>
          <div className="dash-form-actions">
            <button type="submit" className="dash-btn" disabled={busy}>
              Save settings
            </button>
          </div>
        </form>
      </section>

      <section className="dash-section" aria-labelledby="h-outline">
        <div className="dash-head">
          <div>
            <h2 className="dash-h2" id="h-outline">
              Course outline
            </h2>
            <p className="dash-sub">
              Modules hold the lessons, checks, assessments and practice interviews learners work
              through, in order.
            </p>
          </div>
          <button type="button" className="dash-btn-secondary" onClick={addModule} disabled={busy}>
            Add module
          </button>
        </div>

        {course.modules.length === 0 && (
          <div className="dash-empty">
            <h3 className="dash-card-title">No modules yet</h3>
            <p>Add a module, then add lessons and assessments to it.</p>
          </div>
        )}

        <ol className="dash-modules">
          {course.modules.map((m, mi) => (
            <li key={m.id} className="dash-card dash-module">
              <div className="dash-module-head">
                <input
                  className="dash-module-title"
                  aria-label={`Module ${mi + 1} title`}
                  defaultValue={m.title}
                  key={m.title}
                  maxLength={120}
                  onBlur={(e) => renameModule(m.id, e.target.value, m.title)}
                />
                <div className="dash-row-actions">
                  <button
                    type="button"
                    className="dash-btn-quiet"
                    disabled={busy || mi === 0}
                    onClick={() => moveModule(m.id, -1)}
                    aria-label={`Move ${m.title} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="dash-btn-quiet"
                    disabled={busy || mi === course.modules.length - 1}
                    onClick={() => moveModule(m.id, 1)}
                    aria-label={`Move ${m.title} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="dash-btn-quiet"
                    disabled={busy}
                    onClick={() => removeModule(m)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <ol className="dash-items">
                {m.items.map((it, ii) => (
                  <li key={it.id} className="dash-item">
                    <div className="dash-item-head">
                      <span className="dash-item-type">
                        {TYPE_LABEL[it.type] ?? it.type}
                        {it.label ? ` · ${it.label}` : ''}
                      </span>
                      <span className="dash-item-title">{it.title}</span>
                      <div className="dash-row-actions">
                        <button
                          type="button"
                          className="dash-btn-quiet"
                          disabled={busy || ii === 0}
                          onClick={() => moveItem(m.id, it.id, -1)}
                          aria-label={`Move ${it.title} up`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="dash-btn-quiet"
                          disabled={busy || ii === m.items.length - 1}
                          onClick={() => moveItem(m.id, it.id, 1)}
                          aria-label={`Move ${it.title} down`}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="dash-btn-quiet"
                          onClick={() => setEditingItem(editingItem === it.id ? null : it.id)}
                        >
                          {editingItem === it.id ? 'Close' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="dash-btn-quiet"
                          disabled={busy}
                          onClick={() => removeItem(it.id, it.title)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {editingItem === it.id && (
                      <ItemEditor
                        key={it.id}
                        item={it}
                        busy={busy}
                        onSave={(draft) => saveItem(it.id, draft)}
                        onCancel={() => setEditingItem(null)}
                      />
                    )}
                  </li>
                ))}
              </ol>

              <div className="dash-additem">
                <span className="dash-muted">Add:</span>
                <label
                  className={
                    busy ? 'dash-btn-quiet dash-file-disabled' : 'dash-btn-quiet dash-file'
                  }
                >
                  + SCORM package
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (f) void uploadScorm(m.id, f)
                    }}
                  />
                </label>
                {ADD_TYPES.map((k) => (
                  <button
                    key={k.type}
                    type="button"
                    className="dash-btn-quiet"
                    disabled={busy}
                    onClick={() => addItem(m.id, k)}
                  >
                    + {k.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="dash-section dash-danger" aria-labelledby="h-delete">
        <h2 className="dash-card-title" id="h-delete">
          Delete this course
        </h2>
        <p className="dash-sub">
          Removes the course and its modules and items. A course with cohorts cannot be deleted.
        </p>
        <button type="button" className="dash-btn-secondary" onClick={deleteCourse} disabled={busy}>
          Delete course
        </button>
      </section>
    </>
  )
}

/** Offer this course to organizations under the same agency, so they can run their own cohorts of it. */
function OffersPanel({ courseId }: { courseId: string }) {
  const { data, error, reload } = useLoad<CourseOffers>(`/learn/courses/${courseId}/offers`)
  const send = useApiSend()
  const [message, setMessage] = useState<string | null>(null)

  async function change(action: () => Promise<unknown>) {
    setMessage(null)
    try {
      await action()
      reload()
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  if (error || !data) return null
  return (
    <section className="dash-card dash-offers" aria-labelledby="h-offers">
      <h2 className="dash-card-title" id="h-offers">
        Offer to organizations
      </h2>
      <p className="dash-sub">
        Organizations you offer this course to can run their own cohorts of it. They own their
        learners&apos; records.
      </p>
      {message && <p className="dash-banner dash-banner-error">{message}</p>}
      {data.offered.length > 0 && (
        <ul className="dash-offered">
          {data.offered.map((o) => (
            <li key={o.id}>
              <span>{o.name}</span>
              <button
                type="button"
                className="dash-btn-quiet"
                onClick={() =>
                  change(() => send('DELETE', `/learn/courses/${courseId}/offers/${o.subdomain}`))
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {data.available.length > 0 ? (
        <div className="dash-inline-form">
          <label className="dash-field">
            <span>Add an organization</span>
            <select
              defaultValue=""
              onChange={(e) => {
                const workspace = e.target.value
                e.target.value = ''
                if (workspace)
                  void change(() =>
                    send('POST', `/learn/courses/${courseId}/offers`, { workspace })
                  )
              }}
            >
              <option value="">Choose…</option>
              {data.available.map((o) => (
                <option key={o.id} value={o.subdomain}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        data.offered.length === 0 && (
          <p className="dash-muted">
            No organizations under your agency to offer this course to yet.
          </p>
        )
      )}
    </section>
  )
}
