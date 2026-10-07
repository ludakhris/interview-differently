import type { SupportQueueRow } from '@id/types'
import { useState } from 'react'
import { useLoad } from '../api'
import { useApp } from '../app-context'
import { StaffOnlyReminder } from './StaffOnlyReminder'
import { DueText, StatusChip } from './SupportSection'
import { SUPPORT_CATEGORY_LABEL, SUPPORT_STATUSES, SUPPORT_STATUS_LABEL } from './supportLogic'
import './notes.css'

/** The API path for the queue with the chosen filters. `status` '' means the to-do default. */
export function queuePath(
  providerId: string,
  f: { status: string; assigneeId: string; dueBefore: string }
): string {
  const q = new URLSearchParams()
  if (f.status) q.set('status', f.status)
  if (f.assigneeId) q.set('assigneeId', f.assigneeId)
  if (f.dueBefore) q.set('dueBefore', f.dueBefore)
  const s = q.toString()
  return `/learn/providers/${providerId}/support-items${s ? `?${s}` : ''}`
}

/** #69 B, staff only: every follow-up across the provider. Mounted at /lms/talent/support. */
export function SupportQueuePage({ providerId }: { providerId: string }) {
  const { href } = useApp()
  const [status, setStatus] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueBefore, setDueBefore] = useState('')
  const rows = useLoad<SupportQueueRow[]>(queuePath(providerId, { status, assigneeId, dueBefore }))
  const staff = useLoad<{ id: string; name: string }[]>(
    `/learn/providers/${providerId}/staff-members`
  )

  return (
    <>
      <h1 className="dash-h2">Support follow-ups</h1>
      <StaffOnlyReminder />
      <form className="nt-filters" onSubmit={(e) => e.preventDefault()} aria-label="Filters">
        <label className="dash-field">
          <span>Show</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Still to do (open and in progress)</option>
            <option value="all">Everything</option>
            {SUPPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUPPORT_STATUS_LABEL[s]} only
              </option>
            ))}
          </select>
        </label>
        <label className="dash-field">
          <span>Assigned to</span>
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Anyone</option>
            <option value="unassigned">Not assigned</option>
            {(staff.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="dash-field">
          <span>Due by</span>
          <input type="date" value={dueBefore} onChange={(e) => setDueBefore(e.target.value)} />
        </label>
      </form>
      <p role="status" className="dash-muted nt-status">
        {rows.data ? `${rows.data.length} ${rows.data.length === 1 ? 'item' : 'items'}` : ''}
      </p>
      {rows.loading && !rows.data ? (
        <p className="dash-loading">Loading…</p>
      ) : rows.error ? (
        <div className="nt-error" role="alert">
          <p className="dash-error">Could not load the follow-ups. {rows.error.message}</p>
          <button type="button" className="dash-btn-secondary" onClick={rows.reload}>
            Try again
          </button>
        </div>
      ) : (rows.data ?? []).length === 0 ? (
        <p className="dash-muted nt-empty">Nothing matches. Try changing the filters.</p>
      ) : (
        <div className="dash-tablewrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th scope="col">Participant</th>
                <th scope="col">What would help</th>
                <th scope="col">Kind</th>
                <th scope="col">Status</th>
                <th scope="col">Due</th>
                <th scope="col">Assigned to</th>
              </tr>
            </thead>
            <tbody>
              {(rows.data ?? []).map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <a href={href(`/lms/talent/${encodeURIComponent(r.userId)}`)}>
                      {r.participantName}
                    </a>
                  </th>
                  <td>{r.title}</td>
                  <td>{SUPPORT_CATEGORY_LABEL[r.category]}</td>
                  <td>
                    <StatusChip status={r.status} />
                  </td>
                  <td>
                    <DueText item={r} />
                  </td>
                  <td>{r.assigneeName ?? 'Not assigned'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
