import type { AttendanceSheet as Sheet, AttendanceStatus } from '@id/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApiSend } from '../api'
import {
  KEY_STATUS,
  NOTE_KEY,
  STATUS_LABEL,
  STATUS_LETTER,
  STATUS_ORDER,
  changedMarks,
  clock,
  draftsFrom,
  isDirty,
  markEveryonePresent,
  mergeAfterSave,
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
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const rowRefs = useRef<(HTMLLIElement | null)[]>([])
  const noteRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const radioRefs = useRef<Record<string, (HTMLButtonElement | null)[]>>({})

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

  const nameOf = (userId: string) => sheet.rows.find((r) => r.userId === userId)?.name ?? 'Learner'
  const set = (userId: string, status: AttendanceStatus) => {
    setSavedAt(null)
    setAnnounce(`${nameOf(userId)}: ${STATUS_LABEL[status].toLowerCase()}`)
    setDrafts((d) => ({ ...d, [userId]: { ...d[userId], status } }))
  }
  const setNote = (userId: string, note: string) => {
    setSavedAt(null)
    setDrafts((d) => ({ ...d, [userId]: { ...d[userId], note } }))
  }
  const focusNoteOf = (userId: string) => noteRefs.current[userId]?.focus()

  const save = async () => {
    const marks = changedMarks(sheet.rows, drafts)
    if (marks.length === 0) return
    const sent = drafts
    const prevRows = sheet.rows
    const savedIds = new Set(marks.map((m) => m.userId))
    setSaving(true)
    setError(null)
    try {
      // The save returns the fresh sheet. Last write wins for a learner two people marked.
      const next = await send<Sheet>(
        'PUT',
        `/learn/cohorts/${cohortId}/sessions/${sheet.session.id}/marks`,
        { marks }
      )
      setSheet(next)
      // Only what was saved is replaced: edits made while the save was in flight stay.
      setDrafts((cur) => mergeAfterSave(prevRows, sent, savedIds, cur, next.rows))
      setSavedAt(clock(new Date()))
      onSaved()
    } catch (e) {
      setError((e as Error).message || 'Could not save attendance.')
    } finally {
      setSaving(false)
    }
  }

  const onRowKey = (e: React.KeyboardEvent<HTMLLIElement>, i: number, userId: string) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    // Shortcuts work on the row itself and on its status buttons, never inside the note field.
    const onRadio = (e.target as HTMLElement).getAttribute('role') === 'radio'
    if (e.target !== e.currentTarget && !onRadio) return
    const key = e.key.toLowerCase()
    const status = KEY_STATUS[key]
    if (status) {
      e.preventDefault()
      set(userId, status)
    } else if (key === NOTE_KEY) {
      e.preventDefault()
      focusNoteOf(userId)
    } else if (e.target === e.currentTarget && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      rowRefs.current[i + (e.key === 'ArrowDown' ? 1 : -1)]?.focus()
    }
  }

  // A radio group: arrows move and choose, Tab stops once per learner (roving tabindex).
  const onRadioKey = (e: React.KeyboardEvent<HTMLButtonElement>, userId: string, at: number) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    if (!step) return
    e.preventDefault()
    e.stopPropagation()
    const to = (at + step + STATUS_ORDER.length) % STATUS_ORDER.length
    set(userId, STATUS_ORDER[to])
    radioRefs.current[userId]?.[to]?.focus()
  }

  const { rows } = sheet
  return (
    <div className="at-sheet">
      <div className="at-sheet-bar">
        <button
          type="button"
          className="at-all"
          data-autofocus
          onClick={() => {
            setSavedAt(null)
            setAnnounce(`${counts.unmarked} marked present`)
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
        the status, N goes to the note.
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
                <div className="at-pills" role="radiogroup" aria-label={`Status for ${r.name}`}>
                  {STATUS_ORDER.map((s, k) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      ref={(el) => {
                        ;(radioRefs.current[r.userId] ??= [])[k] = el
                      }}
                      // Roving tabindex: the chosen status (or the first, if none) is the one stop.
                      tabIndex={(d.status ?? STATUS_ORDER[0]) === s ? 0 : -1}
                      className={`at-pill at-s-${s}`}
                      aria-checked={d.status === s}
                      onClick={() => set(r.userId, s)}
                      onKeyDown={(e) => onRadioKey(e, r.userId, k)}
                    >
                      <span className="at-seg-word">{STATUS_LABEL[s]}</span>
                      <span aria-hidden="true" className="at-letter">
                        {STATUS_LETTER[s]}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="at-note-cell">
                  <input
                    type="text"
                    className="at-note"
                    aria-label={`Note for ${r.name}`}
                    ref={(el) => {
                      noteRefs.current[r.userId] = el
                    }}
                    placeholder="Add a note"
                    maxLength={500}
                    value={d.note}
                    onChange={(e) => setNote(r.userId, e.target.value)}
                  />
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
        {savedAt && !error ? `Saved at ${savedAt}` : ''}
      </p>
      <p className="dash-visually-hidden" role="status" aria-live="polite">
        {announce}
      </p>
      {error && (
        <p className="dash-error" role="alert">
          {error} Your marks are still here; press Save attendance to try again.
        </p>
      )}
    </div>
  )
}
