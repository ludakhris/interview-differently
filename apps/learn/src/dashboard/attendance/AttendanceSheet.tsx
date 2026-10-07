import type { AttendanceSheet as Sheet, AttendanceStatus } from '@id/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApiSend } from '../api'
import {
  KEY_STATUS,
  STATUS_LABEL,
  STATUS_LETTER,
  STATUS_ORDER,
  changedMarks,
  draftsFrom,
  isDirty,
  markEveryonePresent,
  tally,
  type Drafts,
} from './attendanceLogic'

/** The roster for one session: everyone starts unmarked, one tap marks all present, then flip the exceptions. */
export function AttendanceSheet({
  cohortId,
  initial,
  onSaved,
  onDirtyChange,
}: {
  cohortId: string
  initial: Sheet
  onSaved: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const send = useApiSend()
  const [sheet, setSheet] = useState(initial)
  const [drafts, setDrafts] = useState<Drafts>(() => draftsFrom(initial.rows))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [openNote, setOpenNote] = useState<Record<string, boolean>>({})
  const rowRefs = useRef<(HTMLLIElement | null)[]>([])

  const dirty = isDirty(sheet.rows, drafts)
  const counts = useMemo(() => tally(drafts), [drafts])

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const set = (userId: string, status: AttendanceStatus) => {
    setSaved(false)
    setDrafts((d) => ({ ...d, [userId]: { ...d[userId], status } }))
  }
  const setNote = (userId: string, note: string) => {
    setSaved(false)
    setDrafts((d) => ({ ...d, [userId]: { ...d[userId], note } }))
  }

  const save = async () => {
    const marks = changedMarks(sheet.rows, drafts)
    if (marks.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const next = await send<Sheet>(
        'PUT',
        `/learn/cohorts/${cohortId}/sessions/${sheet.session.id}/marks`,
        { marks }
      )
      setSheet(next)
      setDrafts(draftsFrom(next.rows))
      setSaved(true)
      onSaved()
    } catch (e) {
      setError((e as Error).message || 'Could not save attendance.')
    } finally {
      setSaving(false)
    }
  }

  const onRowKey = (e: React.KeyboardEvent<HTMLLIElement>, i: number, userId: string) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return
    const status = KEY_STATUS[e.key.toLowerCase()]
    if (status) {
      e.preventDefault()
      set(userId, status)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      rowRefs.current[i + (e.key === 'ArrowDown' ? 1 : -1)]?.focus()
    }
  }

  const { rows } = sheet
  return (
    <div className="at-sheet">
      <div className="at-sheet-bar">
        <button
          type="button"
          className="at-all"
          onClick={() => {
            setSaved(false)
            setDrafts((d) => markEveryonePresent(d))
          }}
          disabled={counts.unmarked === 0}
        >
          Mark everyone present
        </button>
        <p className="at-tally" aria-live="off">
          <span className="at-t-present">{counts.present} present</span>
          <span className="at-t-absent">{counts.absent} absent</span>
          <span className="at-t-late">{counts.late} late</span>
          <span className="at-t-excused">{counts.excused} excused</span>
          <span className="at-t-unmarked">{counts.unmarked} not marked</span>
        </p>
      </div>
      <p className="dash-muted at-hint">
        Tap a status to change it. On a keyboard: arrow keys move between learners, P, A, L, E set
        the status.
      </p>

      {rows.length === 0 ? (
        <p className="dash-muted">No learners are enrolled in this cohort yet.</p>
      ) : (
        <ul className="at-rows" aria-label="Learners">
          {rows.map((r, i) => {
            const d = drafts[r.userId]
            return (
              <li
                key={r.userId}
                className="at-row"
                tabIndex={0}
                ref={(el) => {
                  rowRefs.current[i] = el
                }}
                onKeyDown={(e) => onRowKey(e, i, r.userId)}
                aria-label={`${r.name}: ${d.status ? STATUS_LABEL[d.status] : 'not marked'}`}
              >
                <div className="at-who">
                  <span className="at-name">{r.name}</span>
                  {r.email && <span className="dash-muted at-email">{r.email}</span>}
                </div>
                <div className="at-seg" role="group" aria-label={`Status for ${r.name}`}>
                  {STATUS_ORDER.map((s) => (
                    <button
                      key={s}
                      type="button"
                      tabIndex={-1}
                      className={`at-seg-btn at-s-${s}`}
                      aria-pressed={d.status === s}
                      onClick={() => set(r.userId, s)}
                    >
                      <span aria-hidden="true" className="at-letter">
                        {STATUS_LETTER[s]}
                      </span>
                      <span className="at-seg-word">{STATUS_LABEL[s]}</span>
                    </button>
                  ))}
                </div>
                <div className="at-note-cell">
                  {openNote[r.userId] || d.note ? (
                    <input
                      type="text"
                      className="at-note"
                      aria-label={`Note for ${r.name}`}
                      placeholder="Note"
                      maxLength={500}
                      value={d.note}
                      onChange={(e) => setNote(r.userId, e.target.value)}
                    />
                  ) : (
                    <button
                      type="button"
                      tabIndex={-1}
                      className="dash-btn-quiet at-note-add"
                      onClick={() => setOpenNote((o) => ({ ...o, [r.userId]: true }))}
                    >
                      + Note
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="at-savebar">
        <span className={dirty ? 'at-unsaved' : 'dash-muted'}>
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <button
          type="button"
          className="dash-btn at-save"
          onClick={save}
          disabled={!dirty || saving}
        >
          {saving ? 'Saving…' : 'Save attendance'}
        </button>
      </div>
      <p className="at-status" role="status">
        {saved && !error ? 'Attendance saved.' : ''}
      </p>
      {error && (
        <p className="dash-error" role="alert">
          {error} Your marks are still here; press Save attendance to try again.
        </p>
      )}
    </div>
  )
}
