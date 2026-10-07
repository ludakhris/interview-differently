import type { SupportCategory, SupportItemDto, SupportItemInput, SupportStatus } from '@id/types'
import { useState, type FormEvent } from 'react'
import { useApiSend, useLoad } from '../api'
import { dateOnly } from '../format'
import { StaffOnlyReminder } from './StaffOnlyReminder'
import {
  DUE_LABEL,
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABEL,
  dueState,
  sortItems,
} from './supportLogic'
import './notes.css'

export function StatusChip({ status }: { status: SupportStatus }) {
  return <span className={`nt-chip nt-chip-${status}`}>{SUPPORT_STATUS_LABEL[status]}</span>
}

export function DueText({ item }: { item: Pick<SupportItemDto, 'dueDate' | 'status'> }) {
  if (!item.dueDate) return <span className="dash-muted">No due date</span>
  const state = dueState(item.dueDate, item.status)
  return (
    <span className={`nt-due nt-due-${state}`}>
      Due {dateOnly(item.dueDate)}
      {DUE_LABEL[state] ? <strong> · {DUE_LABEL[state]}</strong> : null}
    </span>
  )
}

function ItemRow({
  item,
  onChanged,
  onDeleted,
  announce,
}: {
  item: SupportItemDto
  onChanged: (i: SupportItemDto) => void
  onDeleted: (id: string) => void
  announce: (m: { kind: 'ok' | 'error'; text: string }) => void
}) {
  const send = useApiSend()
  const base = `/learn/providers/${item.providerId}/participants/${item.userId}/support-items/${item.id}`
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const finished = item.status === 'resolved' || item.status === 'cancelled'

  async function setStatus(status: SupportStatus) {
    setBusy(true)
    try {
      const saved = await send<SupportItemDto>('PUT', base, { status })
      onChanged(saved)
      announce({ kind: 'ok', text: `"${item.title}" is now ${SUPPORT_STATUS_LABEL[status]}.` })
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
      onDeleted(item.id)
      announce({ kind: 'ok', text: `"${item.title}" deleted.` })
    } catch (err) {
      announce({ kind: 'error', text: (err as Error).message })
      setBusy(false)
    }
  }

  return (
    <li className={`nt-item${finished ? ' nt-item-done' : ''}`}>
      <input
        type="checkbox"
        className="nt-check"
        checked={item.status === 'resolved'}
        disabled={busy}
        aria-label={`Resolved: ${item.title}`}
        onChange={(e) => setStatus(e.target.checked ? 'resolved' : 'open')}
      />
      <div className="nt-item-main">
        <p className="nt-item-title">
          {item.title} <StatusChip status={item.status} />
        </p>
        <p className="nt-meta">
          {SUPPORT_CATEGORY_LABEL[item.category]} · <DueText item={item} /> ·{' '}
          {item.assigneeName ? `Assigned to ${item.assigneeName}` : 'Not assigned'}
        </p>
        {item.details && <p className="nt-body">{item.details}</p>}
        {confirming && (
          <div className="nt-confirm" role="alertdialog" aria-label={`Delete ${item.title}?`}>
            <span>Delete this item? This cannot be undone.</span>
            <button type="button" className="dash-btn" disabled={busy} onClick={remove}>
              Yes, delete it
            </button>
            <button
              type="button"
              className="dash-btn-quiet"
              onClick={() => setConfirming(false)}
              autoFocus
            >
              Keep it
            </button>
          </div>
        )}
      </div>
      <div className="nt-item-side">
        <label>
          <span className="dash-visually-hidden">Status of {item.title}</span>
          <select
            value={item.status}
            disabled={busy}
            onChange={(e) => setStatus(e.target.value as SupportStatus)}
          >
            {SUPPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUPPORT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {!confirming && (
          <button type="button" className="dash-btn-quiet" onClick={() => setConfirming(true)}>
            Delete
            <span className="dash-visually-hidden"> {item.title}</span>
          </button>
        )}
      </div>
    </li>
  )
}

/** #69 B, staff only: a participant's support follow-ups, across all of the provider's cohorts. */
export function SupportSection({ providerId, userId }: { providerId: string; userId: string }) {
  const send = useApiSend()
  const prefix = `/learn/providers/${providerId}/participants/${userId}`
  const items = useLoad<SupportItemDto[]>(`${prefix}/support-items`)
  const staff = useLoad<{ id: string; name: string }[]>(
    `/learn/providers/${providerId}/staff-members`
  )

  const [added, setAdded] = useState<SupportItemDto[]>([])
  const [edits, setEdits] = useState<Record<string, SupportItemDto>>({})
  const [gone, setGone] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<SupportCategory>('other')
  const [dueDate, setDueDate] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const list = sortItems(
    [...added, ...(items.data ?? []).filter((n) => !added.some((a) => a.id === n.id))]
      .filter((i) => !gone.includes(i.id))
      .map((i) => edits[i.id] ?? i)
  )

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setMessage(null)
    const body: SupportItemInput = {
      title,
      category,
      details: details.trim() || null,
      dueDate: dueDate || null,
      assigneeId: assigneeId || null,
    }
    try {
      const saved = await send<SupportItemDto>('POST', `${prefix}/support-items`, body)
      setAdded((a) => [saved, ...a])
      setTitle('')
      setDetails('')
      setDueDate('')
      setAssigneeId('')
      setCategory('other')
      setMessage({ kind: 'ok', text: `Added "${saved.title}".` })
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="nt-section" aria-labelledby="nt-support-h">
      <h2 id="nt-support-h" className="dash-card-title">
        Ways to support
      </h2>
      <StaffOnlyReminder />
      <form onSubmit={add} className="nt-form">
        <label className="dash-field">
          <span>What would help?</span>
          <input
            type="text"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="For example: a bus pass for evening sessions"
          />
        </label>
        <div className="nt-row">
          <label className="dash-field">
            <span>Kind of help</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as SupportCategory)}
            >
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {SUPPORT_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="dash-field">
            <span>Follow up by (optional)</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="dash-field">
            <span>Assigned to (optional)</span>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Not assigned</option>
              {(staff.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="dash-field">
          <span>Details (optional)</span>
          <textarea
            rows={2}
            value={details}
            maxLength={2000}
            onChange={(e) => setDetails(e.target.value)}
          />
        </label>
        <div className="nt-actions">
          <button type="submit" className="dash-btn" disabled={busy || !title.trim()}>
            Add item
          </button>
        </div>
      </form>
      <p
        role="status"
        className={message?.kind === 'error' ? 'dash-error nt-status' : 'dash-muted nt-status'}
      >
        {message?.text ?? ''}
      </p>
      {items.loading && !items.data ? (
        <p className="dash-loading">Loading…</p>
      ) : items.error ? (
        <div className="nt-error" role="alert">
          <p className="dash-error">Could not load the support items. {items.error.message}</p>
          <button type="button" className="dash-btn-secondary" onClick={items.reload}>
            Try again
          </button>
        </div>
      ) : list.length === 0 ? (
        <p className="dash-muted nt-empty">Nothing to follow up on yet.</p>
      ) : (
        <ul className="nt-items">
          {list.map((i) => (
            <ItemRow
              key={i.id}
              item={i}
              onChanged={(saved) => setEdits((e) => ({ ...e, [saved.id]: saved }))}
              onDeleted={(id) => setGone((g) => [...g, id])}
              announce={setMessage}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
