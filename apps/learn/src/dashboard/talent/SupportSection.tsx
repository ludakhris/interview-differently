import type { SupportCategory, SupportItemDto, SupportItemInput, SupportStatus } from '@id/types'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useApiSend, useLoad } from '../api'
import { dateOnly, dateShort } from '../format'
import { Modal } from '../Modal'
import { StaffOnlyNotice } from '../StaffOnlyNotice'
import {
  DUE_LABEL,
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABEL,
  isDone,
  daysOverdue,
  dueShort,
  dueState,
  splitItems,
  todayKey,
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

type Say = (m: { kind: 'ok' | 'error'; text: string }) => void
type Staff = { id: string; name: string }[]

const LONG = 140
const longText = (t: string) => t.length > LONG || t.split('\n').length > 2

/** Add or edit one follow-up in a dialog. Saves through the existing support-items endpoints. */
function FollowUpModal({
  item,
  prefix,
  staff,
  onSaved,
  onClose,
}: {
  item: SupportItemDto | null
  prefix: string
  staff: Staff
  onSaved: (saved: SupportItemDto, wasNew: boolean) => void
  onClose: () => void
}) {
  const send = useApiSend()
  const formId = useId()
  const [title, setTitle] = useState(item?.title ?? '')
  const [category, setCategory] = useState<SupportCategory>(item?.category ?? 'other')
  const [dueDate, setDueDate] = useState(item?.dueDate ?? '')
  const [assigneeId, setAssigneeId] = useState(item?.assigneeId ?? '')
  const [details, setDetails] = useState(item?.details ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty =
    title !== (item?.title ?? '') ||
    category !== (item?.category ?? 'other') ||
    dueDate !== (item?.dueDate ?? '') ||
    assigneeId !== (item?.assigneeId ?? '') ||
    details !== (item?.details ?? '')

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    const body: SupportItemInput = {
      title,
      category,
      details: details.trim() || null,
      dueDate: dueDate || null,
      assigneeId: assigneeId || null,
    }
    try {
      const saved = item
        ? await send<SupportItemDto>('PUT', `${prefix}/support-items/${item.id}`, body)
        : await send<SupportItemDto>('POST', `${prefix}/support-items`, body)
      onSaved(saved, !item)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={item ? 'Edit follow-up' : 'Add follow-up'}
      onClose={onClose}
      dirty={dirty}
      className="nt-modal"
      footer={
        <>
          <button type="submit" form={formId} className="dash-btn" disabled={busy || !title.trim()}>
            Save
          </button>
          <button type="button" className="dash-btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={save} className="nt-form">
        <label className="dash-field">
          <span>What would help?</span>
          <input
            type="text"
            data-autofocus
            value={title}
            maxLength={200}
            required
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
            <span>Follow up by</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="dash-field">
            <span>Assigned to</span>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Not assigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="dash-field">
          <span>Details</span>
          <textarea
            rows={3}
            value={details}
            maxLength={2000}
            onChange={(e) => setDetails(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="dash-error">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

function Chips({ item }: { item: SupportItemDto }) {
  const today = todayKey()
  const state = dueState(item.dueDate, item.status, today)
  const late = item.dueDate ? daysOverdue(item.dueDate, today) : 0
  return (
    <p className="nt-chips">
      <span className="nt-pill">{SUPPORT_CATEGORY_LABEL[item.category]}</span>
      {item.dueDate && <span className="nt-pill">Due {dueShort(item.dueDate, today)}</span>}
      {state === 'overdue' && (
        <span className="nt-pill nt-pill-late">
          Overdue by {late} {late === 1 ? 'day' : 'days'}
        </span>
      )}
      {state === 'today' && <span className="nt-pill nt-pill-soon">Due today</span>}
      {state === 'soon' && <span className="nt-pill nt-pill-soon">Due soon</span>}
      <span className={item.assigneeName ? 'nt-pill' : 'nt-pill nt-pill-muted'}>
        {item.assigneeName ? `Assigned to ${item.assigneeName}` : 'Unassigned'}
      </span>
    </p>
  )
}

function ItemCard({
  item,
  prefix,
  onChanged,
  onEdit,
  onDeleted,
  announce,
}: {
  item: SupportItemDto
  prefix: string
  onChanged: (i: SupportItemDto) => void
  onEdit: (i: SupportItemDto) => void
  onDeleted: (id: string) => void
  announce: Say
}) {
  const send = useApiSend()
  const base = `${prefix}/support-items/${item.id}`
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [more, setMore] = useState(false)
  const deleteBtn = useRef<HTMLButtonElement>(null)
  const keepFocus = useRef(false)
  const confirmId = useId()
  // Cancelling the confirm brings Delete back: focus it rather than letting focus fall to the body.
  useEffect(() => {
    if (!confirming && keepFocus.current) {
      keepFocus.current = false
      deleteBtn.current?.focus()
    }
  }, [confirming])

  async function setStatus(status: SupportStatus) {
    setBusy(true)
    try {
      onChanged(await send<SupportItemDto>('PUT', base, { status }))
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

  const finished = isDone(item.status)
  return (
    <li className={`nt-item nt-item-${item.status}${finished ? ' nt-item-done' : ''}`}>
      <div className="nt-item-main">
        <p className="nt-item-title">
          <span className="nt-icon" aria-hidden="true">
            {item.status === 'resolved' ? '\u2713' : item.status === 'in_progress' ? '\u25D0' : ''}
          </span>
          {item.title}
        </p>
        <Chips item={item} />
        {item.details && (
          <>
            <p className={`nt-body nt-details${more ? '' : ' nt-clamp'}`}>{item.details}</p>
            {longText(item.details) && (
              <button
                type="button"
                className="dash-linkbtn nt-more"
                aria-expanded={more}
                onClick={() => setMore(!more)}
              >
                {more ? 'Show less' : 'Show more'}
              </button>
            )}
          </>
        )}
        <p className="nt-meta nt-by">
          Added by {item.createdByName} · {dateShort(item.createdAt)}
          {item.status === 'resolved' && item.resolvedAt
            ? ` · Resolved ${dateShort(item.resolvedAt)}`
            : ''}
        </p>
        {confirming && (
          <div
            className="nt-confirm"
            role="group"
            aria-label={`Delete ${item.title}?`}
            aria-describedby={confirmId}
          >
            <span id={confirmId}>Delete this follow-up? This cannot be undone.</span>
            <button type="button" className="dash-btn" disabled={busy} onClick={remove}>
              Yes, delete it
            </button>
            <button
              type="button"
              className="dash-btn-quiet"
              onClick={() => {
                keepFocus.current = true
                setConfirming(false)
              }}
              autoFocus
            >
              Keep it
            </button>
          </div>
        )}
      </div>
      <div className="nt-item-side">
        <label className="nt-status-field">
          <span>
            Status<span className="dash-visually-hidden"> of {item.title}</span>
          </span>
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
          <div className="nt-item-actions">
            <button type="button" className="dash-btn-secondary" onClick={() => onEdit(item)}>
              Edit<span className="dash-visually-hidden"> {item.title}</span>
            </button>
            <button
              ref={deleteBtn}
              type="button"
              className="dash-btn-secondary"
              onClick={() => setConfirming(true)}
            >
              Delete<span className="dash-visually-hidden"> {item.title}</span>
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

/** #69 B, staff only: a participant's support follow-ups, across all of the provider's cohorts. */
export function SupportSection({
  providerId,
  userId,
  initial,
  embedded = false,
  onOpenCount,
}: {
  providerId: string
  userId: string
  /** Items the page already loaded (and audited): used instead of loading them a second time. */
  initial?: SupportItemDto[]
  /** Inside another page's section: no heading or notice of its own (the page has them). */
  embedded?: boolean
  /** Told how many items are still open or in progress whenever that changes. */
  onOpenCount?: (n: number) => void
}) {
  const prefix = `/learn/providers/${providerId}/participants/${userId}`
  const loaded = useLoad<SupportItemDto[]>(initial ? null : `${prefix}/support-items`)
  const items = initial ? { ...loaded, data: initial, loading: false, error: null } : loaded
  const staff = useLoad<{ id: string; name: string }[]>(
    `/learn/providers/${providerId}/staff-members`
  )

  const heading = useRef<HTMLHeadingElement>(null)
  const addBtn = useRef<HTMLButtonElement>(null)
  const [added, setAdded] = useState<SupportItemDto[]>([])
  const [edits, setEdits] = useState<Record<string, SupportItemDto>>({})
  const [gone, setGone] = useState<string[]>([])
  const [modal, setModal] = useState<{ item: SupportItemDto | null } | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const all = [...added, ...(items.data ?? []).filter((n) => !added.some((a) => a.id === n.id))]
    .filter((i) => !gone.includes(i.id))
    .map((i) => edits[i.id] ?? i)
  const { active, done } = splitItems(all)
  const openCount = active.length
  useEffect(() => {
    onOpenCount?.(openCount)
  }, [openCount, onOpenCount])

  function card(i: SupportItemDto) {
    return (
      <ItemCard
        key={i.id}
        item={i}
        prefix={prefix}
        onChanged={(saved) => setEdits((e) => ({ ...e, [saved.id]: saved }))}
        onEdit={(it) => setModal({ item: it })}
        onDeleted={(id) => {
          setGone((g) => [...g, id])
          addBtn.current?.focus()
        }}
        announce={setMessage}
      />
    )
  }

  return (
    <section className="nt-section" aria-labelledby="nt-support-h">
      <div className="nt-head">
        {embedded ? (
          <h3 id="nt-support-h" ref={heading} tabIndex={-1} className="dash-visually-hidden">
            Follow-up list
          </h3>
        ) : (
          <h2 id="nt-support-h" ref={heading} tabIndex={-1} className="dash-card-title">
            Support follow-ups
          </h2>
        )}
        <span className="nt-count" aria-label={`${openCount} open`}>
          {openCount} open
        </span>
        <button
          ref={addBtn}
          type="button"
          className="dash-btn nt-add"
          onClick={() => setModal({ item: null })}
        >
          Add follow-up
        </button>
      </div>
      {!embedded && <StaffOnlyNotice />}
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
      ) : all.length === 0 ? (
        <p className="dash-muted nt-empty">
          No follow-ups yet. Add one when someone needs help with something like transportation or
          childcare.
        </p>
      ) : (
        <>
          {active.length > 0 && <ul className="nt-items">{active.map(card)}</ul>}
          {done.length > 0 && (
            <div className="nt-done">
              <button
                type="button"
                className="dash-btn-quiet nt-done-toggle"
                aria-expanded={showDone}
                onClick={() => setShowDone(!showDone)}
              >
                <span aria-hidden="true">{showDone ? '\u25BE' : '\u25B8'}</span> Resolved (
                {done.length})
              </button>
              {showDone && <ul className="nt-items">{done.map(card)}</ul>}
            </div>
          )}
        </>
      )}
      {modal && (
        <FollowUpModal
          item={modal.item}
          prefix={prefix}
          staff={staff.data ?? []}
          onClose={() => setModal(null)}
          onSaved={(saved, wasNew) => {
            if (wasNew) setAdded((a) => [saved, ...a])
            else setEdits((e) => ({ ...e, [saved.id]: saved }))
            setModal(null)
            setMessage({
              kind: 'ok',
              text: wasNew ? `Added "${saved.title}".` : `Saved "${saved.title}".`,
            })
          }}
        />
      )}
    </section>
  )
}
