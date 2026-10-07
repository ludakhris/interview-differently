import type { AttendanceSheet as Sheet, CohortSessionDto } from '@id/types'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useApiSend, useLoad } from '../api'
import { AttendanceSheet } from './AttendanceSheet'
import { Modal, UNSAVED_PROMPT } from './Modal'
import {
  STATUS_LABEL,
  STATUS_LETTER,
  fromLocalInput,
  toLocalInput,
  whenLabel,
} from './attendanceLogic'

function SheetState({
  sheet,
  children,
}: {
  sheet: ReturnType<typeof useLoad<Sheet>>
  children: (data: Sheet) => ReactNode
}) {
  if (sheet.error)
    return (
      <div className="at-error">
        <p className="dash-error" role="alert">
          Could not load the roster for this session.
        </p>
        <button type="button" className="dash-btn-secondary" onClick={sheet.reload}>
          Try again
        </button>
      </div>
    )
  if (!sheet.data) return <p className="dash-loading">Loading roster…</p>
  return <>{children(sheet.data)}</>
}

const sub = (s: CohortSessionDto) =>
  `${whenLabel(s.startsAt)}${s.location ? ` · ${s.location}` : ''}`

/** The fast sheet in a dialog: mark everyone present, flip exceptions, add notes, one Save. */
export function RecordModal({
  cohortId,
  session,
  taken,
  onClose,
  onSaved,
}: {
  cohortId: string
  session: CohortSessionDto
  taken: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const sheet = useLoad<Sheet>(`/learn/cohorts/${cohortId}/sessions/${session.id}/marks`)
  const [dirty, setDirty] = useState(false)
  return (
    <Modal
      title={`${taken ? 'Edit attendance' : 'Record attendance'}: ${session.title}`}
      onClose={onClose}
      dirty={dirty}
    >
      <p className="dash-muted at-modal-sub">{sub(session)}</p>
      <SheetState sheet={sheet}>
        {(data) => (
          <AttendanceSheet
            cohortId={cohortId}
            initial={data}
            onSaved={onSaved}
            onDirtyChange={setDirty}
          />
        )}
      </SheetState>
    </Modal>
  )
}

/** Read-only: who was where, with the staff notes. */
export function ViewModal({
  cohortId,
  session,
  taken,
  onClose,
  onRecord,
  onDownload,
}: {
  cohortId: string
  session: CohortSessionDto
  taken: boolean
  onClose: () => void
  onRecord: () => void
  onDownload: () => void
}) {
  const sheet = useLoad<Sheet>(`/learn/cohorts/${cohortId}/sessions/${session.id}/marks`)
  return (
    <Modal
      title={`Attendance: ${session.title}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="dash-btn" onClick={onRecord}>
            {taken ? 'Edit attendance' : 'Record attendance'}
          </button>
          <button type="button" className="dash-btn-secondary" onClick={onDownload}>
            Download CSV
          </button>
        </>
      }
    >
      <p className="dash-muted at-modal-sub">{sub(session)}</p>
      <SheetState sheet={sheet}>
        {(data) =>
          data.rows.length === 0 ? (
            <p className="dash-muted">No learners are enrolled in this cohort yet.</p>
          ) : (
            <ul className="at-view" aria-label="Learners">
              {data.rows.map((r) => (
                <li key={r.userId} className="at-view-row">
                  <span className="at-name">{r.name}</span>
                  {r.status ? (
                    <span className={`at-badge at-s-${r.status}`}>
                      <span aria-hidden="true">{STATUS_LETTER[r.status]}</span>{' '}
                      {STATUS_LABEL[r.status]}
                    </span>
                  ) : (
                    <span className="dash-muted">Not marked</span>
                  )}
                  {r.note && <span className="at-view-note">{r.note}</span>}
                </li>
              ))}
            </ul>
          )
        }
      </SheetState>
    </Modal>
  )
}

/** Add (session null) or edit a session: title, when, optional location. */
export function SessionModal({
  cohortId,
  session,
  defaultTitle,
  onClose,
  onDone,
}: {
  cohortId: string
  session: CohortSessionDto | null
  defaultTitle: string
  onClose: () => void
  onDone: (made: CohortSessionDto) => void
}) {
  const send = useApiSend()
  const initial = useRef({
    title: session?.title ?? defaultTitle,
    startsAt: toLocalInput(session?.startsAt ?? new Date().toISOString()),
    location: session?.location ?? '',
  }).current
  const [title, setTitle] = useState(initial.title)
  const [startsAt, setStartsAt] = useState(initial.startsAt)
  const [location, setLocation] = useState(initial.location)
  const [errors, setErrors] = useState<{ title?: string; startsAt?: string; form?: string }>({})
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const startsRef = useRef<HTMLInputElement>(null)
  const formErrorRef = useRef<HTMLParagraphElement>(null)
  // Focus follows the error: a missing field takes focus, a server error takes focus on its message.
  const [focusTick, setFocusTick] = useState(0)
  useEffect(() => {
    if (focusTick === 0) return
    if (errors.title) titleRef.current?.focus()
    else if (errors.startsAt) startsRef.current?.focus()
    else if (errors.form) formErrorRef.current?.focus()
  }, [focusTick, errors])
  const fail = (e: typeof errors) => {
    setErrors(e)
    setFocusTick((n) => n + 1)
  }
  const dirty =
    title !== initial.title || startsAt !== initial.startsAt || location !== initial.location

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const iso = fromLocalInput(startsAt)
    const found: typeof errors = {}
    if (title.trim() === '') found.title = 'Enter a title.'
    if (startsAt === '' || !iso) found.startsAt = 'Enter a start date and time.'
    if (found.title || found.startsAt) return fail(found)
    setSaving(true)
    setErrors({})
    const body = {
      title,
      startsAt: iso,
      location: location.trim() === '' ? null : location.trim(),
    }
    try {
      const made = session
        ? await send<CohortSessionDto>(
            'PUT',
            `/learn/cohorts/${cohortId}/sessions/${session.id}`,
            body
          )
        : await send<CohortSessionDto>('POST', `/learn/cohorts/${cohortId}/sessions`, body)
      onDone(made)
    } catch (err) {
      fail({ form: (err as Error).message || 'Could not save the session.' })
      setSaving(false)
    }
  }

  return (
    <Modal title={session ? 'Edit session' : 'Add session'} onClose={onClose} dirty={dirty}>
      <form className="at-form at-form-modal" onSubmit={submit} noValidate>
        <label>
          Title
          <input
            ref={titleRef}
            value={title}
            maxLength={120}
            data-autofocus
            aria-required="true"
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'at-err-title' : undefined}
            onChange={(e) => setTitle(e.target.value)}
          />
          {errors.title && (
            <span className="dash-error at-field-error" id="at-err-title">
              {errors.title}
            </span>
          )}
        </label>
        <label>
          Date and time
          <input
            ref={startsRef}
            type="datetime-local"
            value={startsAt}
            aria-required="true"
            aria-invalid={!!errors.startsAt}
            aria-describedby={errors.startsAt ? 'at-err-starts' : undefined}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          {errors.startsAt && (
            <span className="dash-error at-field-error" id="at-err-starts">
              {errors.startsAt}
            </span>
          )}
        </label>
        <label>
          Location (optional)
          <input value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} />
        </label>
        {errors.form && (
          <p className="dash-error" role="alert" tabIndex={-1} ref={formErrorRef}>
            {errors.form}
          </p>
        )}
        <div className="at-form-actions">
          <button type="submit" className="dash-btn" disabled={saving}>
            {session ? 'Save session' : 'Add session'}
          </button>
          <button
            type="button"
            className="dash-btn-quiet"
            onClick={() => {
              if (dirty && !window.confirm(UNSAVED_PROMPT)) return
              onClose()
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
