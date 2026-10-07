import type { ParticipantNoteDto, TalentParticipantHeader } from '@id/types'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useApiSend, useLoad } from '../api'
import { dateShort } from '../format'
import { StaffOnlyNotice } from '../StaffOnlyNotice'
import './notes.css'

const MAX = 4000

/** Plain text only: React escapes it, and CSS keeps the line breaks. */
function NoteItem({
  note,
  cohortName,
  onSaved,
  onDeleted,
  announce,
}: {
  note: ParticipantNoteDto
  cohortName: string | null
  onSaved: (n: ParticipantNoteDto) => void
  onDeleted: (id: string) => void
  announce: (m: { kind: 'ok' | 'error'; text: string }) => void
}) {
  const send = useApiSend()
  const base = `/learn/providers/${note.providerId}/participants/${note.userId}/notes/${note.id}`
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view')
  const [draft, setDraft] = useState(note.body)
  const [busy, setBusy] = useState(false)
  const editBtn = useRef<HTMLButtonElement>(null)
  const deleteBtn = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<'edit' | 'delete' | null>(null)
  const confirmId = useId()
  // Leaving edit or confirm hides the control that had focus: send it back to the one that opened it.
  useEffect(() => {
    if (mode !== 'view' || !returnTo.current) return
    ;(returnTo.current === 'edit' ? editBtn : deleteBtn).current?.focus()
    returnTo.current = null
  }, [mode])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    setBusy(true)
    try {
      const saved = await send<ParticipantNoteDto>('PUT', base, { body: draft })
      onSaved(saved)
      returnTo.current = 'edit'
      setMode('view')
      announce({ kind: 'ok', text: 'Note saved.' })
    } catch (err) {
      announce({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    setBusy(true)
    try {
      await send('DELETE', base)
      onDeleted(note.id)
      announce({ kind: 'ok', text: 'Note deleted.' })
    } catch (err) {
      announce({ kind: 'error', text: (err as Error).message })
      setBusy(false)
    }
  }

  const edited = Date.parse(note.updatedAt) - Date.parse(note.createdAt) > 2000
  return (
    <li className="nt-note">
      <p className="nt-meta">
        <span className="nt-tag">
          {cohortName ?? (note.cohortId ? 'Another cohort' : 'All cohorts')}
        </span>{' '}
        <strong>{note.authorName}</strong> · {dateShort(note.createdAt)}
        {edited ? ' · edited' : ''}
      </p>
      {mode === 'edit' ? (
        <form onSubmit={save} className="nt-form">
          <label className="dash-field">
            <span className="dash-visually-hidden">Edit note</span>
            <textarea
              rows={4}
              value={draft}
              maxLength={MAX}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
          </label>
          <div className="nt-actions">
            <button type="submit" className="dash-btn" disabled={busy || !draft.trim()}>
              Save note
            </button>
            <button
              type="button"
              className="dash-btn-quiet"
              onClick={() => {
                setDraft(note.body)
                returnTo.current = 'edit'
                setMode('view')
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className="nt-body">{note.body}</p>
      )}
      {mode === 'view' && (
        <div className="nt-actions">
          <button
            ref={editBtn}
            type="button"
            className="dash-btn-quiet"
            onClick={() => setMode('edit')}
          >
            Edit
          </button>
          <button
            ref={deleteBtn}
            type="button"
            className="dash-btn-quiet"
            onClick={() => setMode('confirm')}
          >
            Delete
          </button>
        </div>
      )}
      {mode === 'confirm' && (
        <div
          className="nt-confirm"
          role="group"
          aria-label="Delete this note?"
          aria-describedby={confirmId}
        >
          <span id={confirmId}>Delete this note? This cannot be undone.</span>
          <button type="button" className="dash-btn" disabled={busy} onClick={remove}>
            Yes, delete it
          </button>
          <button
            type="button"
            className="dash-btn-quiet"
            onClick={() => {
              returnTo.current = 'delete'
              setMode('view')
            }}
            autoFocus
          >
            Keep it
          </button>
        </div>
      )}
    </li>
  )
}

/** #69 B, staff only: a participant's private notes, across all of the provider's cohorts. */
export function NotesSection({
  providerId,
  userId,
  cohorts: given,
}: {
  providerId: string
  userId: string
  /** The participant's cohorts when the page already loaded them; otherwise they are fetched here. */
  cohorts?: TalentParticipantHeader['cohorts']
}) {
  const send = useApiSend()
  const prefix = `/learn/providers/${providerId}/participants/${userId}`
  const notes = useLoad<ParticipantNoteDto[]>(`${prefix}/notes`)
  // Only used to name cohorts; the notes work without it. Not fetched when the page passed them in.
  const header = useLoad<TalentParticipantHeader>(given ? null : prefix)
  const cohorts = given ?? header.data?.cohorts ?? []
  const heading = useRef<HTMLHeadingElement>(null)
  const cohortName = (id: string | null) =>
    id ? (cohorts.find((c) => c.cohortId === id)?.cohortName ?? null) : null

  const [added, setAdded] = useState<ParticipantNoteDto[]>([])
  const [edits, setEdits] = useState<Record<string, ParticipantNoteDto>>({})
  const [gone, setGone] = useState<string[]>([])
  const [text, setText] = useState('')
  const [cohortId, setCohortId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const list = [...added, ...(notes.data ?? []).filter((n) => !added.some((a) => a.id === n.id))]
    .filter((n) => !gone.includes(n.id))
    .map((n) => edits[n.id] ?? n)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      const n = await send<ParticipantNoteDto>('POST', `${prefix}/notes`, {
        body: text,
        cohortId: cohortId || null,
      })
      setAdded((a) => [n, ...a])
      setText('')
      setMessage({ kind: 'ok', text: 'Note added.' })
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="nt-section" aria-labelledby="nt-notes-h">
      <h2 id="nt-notes-h" ref={heading} tabIndex={-1} className="dash-card-title">
        Instructor notes
      </h2>
      <StaffOnlyNotice />
      <form onSubmit={add} className="nt-form">
        <label className="dash-field">
          <span>Add a note</span>
          <textarea
            rows={3}
            value={text}
            maxLength={MAX}
            onChange={(e) => setText(e.target.value)}
            placeholder="What would the next instructor want to know?"
          />
        </label>
        {cohorts.length > 0 && (
          <label className="dash-field">
            <span>About which cohort (optional)</span>
            <select value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
              <option value="">Not specific to one cohort</option>
              {cohorts.map((c) => (
                <option key={c.cohortId} value={c.cohortId}>
                  {c.cohortName}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="nt-actions">
          <button type="submit" className="dash-btn" disabled={busy || !text.trim()}>
            Add note
          </button>
        </div>
      </form>
      <p
        role="status"
        className={message?.kind === 'error' ? 'dash-error nt-status' : 'dash-muted nt-status'}
      >
        {message?.text ?? ''}
      </p>
      {notes.loading && !notes.data ? (
        <p className="dash-loading">Loading notes…</p>
      ) : notes.error ? (
        <div className="nt-error" role="alert">
          <p className="dash-error">Could not load the notes. {notes.error.message}</p>
          <button type="button" className="dash-btn-secondary" onClick={notes.reload}>
            Try again
          </button>
        </div>
      ) : list.length === 0 ? (
        <p className="dash-muted nt-empty">No notes yet. Add the first one above.</p>
      ) : (
        <ul className="nt-list">
          {list.map((n) => (
            <NoteItem
              key={n.id}
              note={n}
              cohortName={cohortName(n.cohortId)}
              onSaved={(saved) => setEdits((e) => ({ ...e, [saved.id]: saved }))}
              onDeleted={(id) => {
                setGone((g) => [...g, id])
                // The deleted note had focus; the heading is the nearest stable place.
                heading.current?.focus()
              }}
              announce={setMessage}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
