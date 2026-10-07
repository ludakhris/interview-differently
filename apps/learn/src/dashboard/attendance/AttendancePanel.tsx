import './attendance.css'
import type { AttendanceSheet as Sheet, CohortSessionDto } from '@id/types'
import { useCallback, useEffect, useState } from 'react'
import { useApiSend, useLoad } from '../api'
import { AttendanceSheet } from './AttendanceSheet'
import { AttendanceSummaryView } from './AttendanceSummaryView'
import {
  defaultSessionTitle,
  fromLocalInput,
  pickInitialSession,
  toLocalInput,
} from './attendanceLogic'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

/** Sessions and whole-cohort attendance marking. CohortPage mounts it for live and hybrid cohorts. */
export function AttendancePanel({ cohortId }: { cohortId: string }) {
  const send = useApiSend()
  const sessions = useLoad<CohortSessionDto[]>(`/learn/cohorts/${cohortId}/sessions`)
  const [tab, setTab] = useState<'take' | 'summary'>('take')
  const [selected, setSelected] = useState<string | null>(null)
  const [picked, setPicked] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const list = sessions.data
  useEffect(() => {
    if (list && !picked) {
      setSelected(pickInitialSession(list, Date.now()))
      setPicked(true)
    }
  }, [list, picked])

  const choose = (id: string) => {
    if (id === selected) return
    if (
      dirty &&
      !window.confirm('You have unsaved attendance for this session. Leave without saving?')
    )
      return
    setDirty(false)
    setEditing(false)
    setSelected(id)
  }

  const add = async () => {
    if (
      dirty &&
      !window.confirm('You have unsaved attendance for this session. Leave without saving?')
    )
      return
    setBusy(true)
    setMessage(null)
    try {
      const made = await send<CohortSessionDto>('POST', `/learn/cohorts/${cohortId}/sessions`, {
        title: defaultSessionTitle(list ?? []),
        startsAt: new Date().toISOString(),
      })
      setDirty(false)
      setEditing(false)
      setSelected(made.id)
      sessions.reload()
    } catch (e) {
      setMessage((e as Error).message || 'Could not add the session.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (s: CohortSessionDto) => {
    if (!window.confirm(`Delete "${s.title}" and all of its attendance marks?`)) return
    setBusy(true)
    setMessage(null)
    try {
      await send('DELETE', `/learn/cohorts/${cohortId}/sessions/${s.id}`)
      setDirty(false)
      setEditing(false)
      setSelected(
        pickInitialSession(
          (list ?? []).filter((x) => x.id !== s.id),
          Date.now()
        )
      )
      sessions.reload()
    } catch (e) {
      setMessage((e as Error).message || 'Could not delete the session.')
    } finally {
      setBusy(false)
    }
  }

  const onSaved = useCallback(() => sessions.reload(), [sessions])
  const current = list?.find((s) => s.id === selected) ?? null

  return (
    <section className="dash-section at" aria-labelledby="h-attendance">
      <div className="at-head">
        <h2 className="dash-h2" id="h-attendance">
          Attendance
        </h2>
        <div className="at-tabs" role="group" aria-label="Attendance view">
          <button
            type="button"
            className="at-tab"
            aria-pressed={tab === 'take'}
            onClick={() => setTab('take')}
          >
            Take attendance
          </button>
          <button
            type="button"
            className="at-tab"
            aria-pressed={tab === 'summary'}
            onClick={() => {
              if (dirty && !window.confirm('You have unsaved attendance. Leave without saving?'))
                return
              setDirty(false)
              setTab('summary')
            }}
          >
            Summary
          </button>
        </div>
      </div>

      {sessions.error ? (
        <div className="at-error">
          <p className="dash-error" role="alert">
            Could not load the sessions.
          </p>
          <button type="button" className="dash-btn-secondary" onClick={sessions.reload}>
            Try again
          </button>
        </div>
      ) : !list ? (
        <p className="dash-loading">Loading sessions…</p>
      ) : tab === 'summary' ? (
        <AttendanceSummaryView cohortId={cohortId} />
      ) : (
        <>
          <div className="at-sessions">
            <button type="button" className="dash-btn at-add" onClick={add} disabled={busy}>
              Add session
            </button>
            {list.length > 0 && (
              <ul className="at-chips" aria-label="Sessions">
                {list.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="at-chip"
                      aria-pressed={s.id === selected}
                      onClick={() => choose(s.id)}
                    >
                      <span className="at-chip-title">{s.title}</span>
                      <span className="dash-muted at-chip-sub">
                        {when(s.startsAt)} ·{' '}
                        {s.counts.unmarked === 0 ? 'all marked' : `${s.counts.unmarked} not marked`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {message && (
            <p className="dash-error" role="alert">
              {message}
            </p>
          )}
          {list.length === 0 && (
            <p className="dash-muted">
              No sessions yet. Add one to start taking attendance; it is named and timed for you.
            </p>
          )}
          {current && (
            <div className="at-current">
              <div className="at-current-head">
                <h3 className="at-h3">
                  {current.title}
                  <span className="dash-muted at-h3-sub">
                    {when(current.startsAt)}
                    {current.location ? ` · ${current.location}` : ''}
                  </span>
                </h3>
                <div className="at-current-actions">
                  <button
                    type="button"
                    className="dash-btn-quiet"
                    onClick={() => setEditing((v) => !v)}
                    aria-expanded={editing}
                  >
                    Edit session
                  </button>
                  <button
                    type="button"
                    className="dash-btn-quiet"
                    onClick={() => remove(current)}
                    disabled={busy}
                  >
                    Delete session
                  </button>
                </div>
              </div>
              {editing && (
                <SessionForm
                  key={current.id}
                  session={current}
                  cohortId={cohortId}
                  onDone={() => {
                    setEditing(false)
                    sessions.reload()
                  }}
                />
              )}
              <SheetLoader
                key={current.id}
                cohortId={cohortId}
                sessionId={current.id}
                onSaved={onSaved}
                onDirtyChange={setDirty}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}

function SheetLoader({
  cohortId,
  sessionId,
  onSaved,
  onDirtyChange,
}: {
  cohortId: string
  sessionId: string
  onSaved: () => void
  onDirtyChange: (d: boolean) => void
}) {
  const sheet = useLoad<Sheet>(`/learn/cohorts/${cohortId}/sessions/${sessionId}/marks`)
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
  return (
    <AttendanceSheet
      cohortId={cohortId}
      initial={sheet.data}
      onSaved={onSaved}
      onDirtyChange={onDirtyChange}
    />
  )
}

function SessionForm({
  session,
  cohortId,
  onDone,
}: {
  session: CohortSessionDto
  cohortId: string
  onDone: () => void
}) {
  const send = useApiSend()
  const [title, setTitle] = useState(session.title)
  const [startsAt, setStartsAt] = useState(toLocalInput(session.startsAt))
  const [location, setLocation] = useState(session.location ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const iso = fromLocalInput(startsAt)
    if (!iso) return setError('Enter a valid start time.')
    setSaving(true)
    setError(null)
    try {
      await send('PUT', `/learn/cohorts/${cohortId}/sessions/${session.id}`, {
        title,
        startsAt: iso,
        location: location.trim() === '' ? null : location.trim(),
      })
      onDone()
    } catch (err) {
      setError((err as Error).message || 'Could not save the session.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="at-form" onSubmit={submit}>
      <label>
        Title
        <input value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Starts
        <input
          type="datetime-local"
          value={startsAt}
          required
          onChange={(e) => setStartsAt(e.target.value)}
        />
      </label>
      <label>
        Location
        <input value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} />
      </label>
      <button type="submit" className="dash-btn-secondary" disabled={saving}>
        Save session
      </button>
      {error && (
        <p className="dash-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
