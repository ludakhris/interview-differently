import type { CohortListItem } from '@id/types'
import './attendance/attendance.css'
import './members.css'
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { dateShort } from './format'
import { Modal, UNSAVED_PROMPT } from './Modal'
import { useApiSend, useLoad } from './api'
import { useApp } from './app-context'
import { canManageMembers, ROLE_ORDER, staffPageLabel } from './roleAccess'
import { errorNotice, useWorkspaceRole } from './shared'
import { Notice } from './DashboardShell'

interface Member {
  membershipId: string
  userId: string
  name: string | null
  email: string | null
  role: string
  cohort: { id: string; name: string } | null
}
interface Invite {
  inviteId: string
  email: string
  role: string
  cohort: { id: string; name: string } | null
  createdAt: string
}
interface MemberList {
  members: Member[]
  invites: Invite[]
  /** The roles the caller may give here. */
  grantable: string[]
}

export const ROLE_LABEL: Record<string, string> = {
  'agency-admin': 'Agency admins',
  'provider-admin': 'Provider admins',
  'organization-admin': 'Organization admins',
  'case-manager': 'Case managers',
  instructor: 'Instructors',
}
const ROLE_NAME: Record<string, string> = {
  'agency-admin': 'Agency admin',
  'provider-admin': 'Provider admin',
  'organization-admin': 'Organization admin',
  'case-manager': 'Case manager',
  instructor: 'Instructor',
}
const ROLE_ABOUT: Record<string, string> = {
  'agency-admin': 'Sees outcomes across the agency and manages who has access.',
  'provider-admin': 'Runs courses, cohorts and learner records, and manages who has access.',
  'organization-admin':
    'Runs cohorts and learner records for the organization, and manages who has access.',
  'case-manager': 'Reads outcomes and gradebooks. Cannot change anything.',
  instructor: 'Sees one cohort: its roster, attendance and gradebook.',
}
/** Chip colours, matching the admin users page where a role appears in both. */
const ROLE_COLOR: Record<string, { solid: string; tint: string }> = {
  'agency-admin': { solid: '#0d5a94', tint: '#d8ecfb' },
  'provider-admin': { solid: '#0b6b5c', tint: '#d9f2ec' },
  'organization-admin': { solid: '#7a4a00', tint: '#fdf0d5' },
  'case-manager': { solid: '#b4380f', tint: '#ffe0d6' },
  instructor: { solid: '#8a2a6b', tint: '#fbe3f3' },
}
const roleName = (r: string) => ROLE_NAME[r] ?? r
const rank = (r: string) => ROLE_ORDER.indexOf(r as (typeof ROLE_ORDER)[number])

interface Row {
  key: string
  kind: 'member' | 'invite'
  id: string
  name: string | null
  email: string | null
  role: string
  cohort: { id: string; name: string } | null
  createdAt?: string
}

function RoleChip({ role }: { role: string }) {
  const c = ROLE_COLOR[role] ?? { solid: '#4b5563', tint: '#eef0f3' }
  return (
    <span className="mb-chip" style={{ '--role': c.solid, '--role-tint': c.tint } as CSSProperties}>
      {roleName(role)}
    </span>
  )
}

/** The people who hold a role at a workspace, one grid for members and invitations, with a panel to add one. */
export function MembersPage({ workspace }: { workspace: string }) {
  const { current } = useApp()
  const role = useWorkspaceRole(workspace)
  const base = `/learn/workspaces/${encodeURIComponent(workspace)}`
  const allowed = canManageMembers(role)
  const list = useLoad<MemberList>(allowed ? `${base}/members` : null)
  const send = useApiSend()
  // Opened from a cohort: the panel starts open on an instructor for that cohort.
  const fromCohort = new URLSearchParams(window.location.search).get('cohort')
  const [panelOpen, setPanelOpen] = useState(fromCohort !== null)
  const [showAll, setShowAll] = useState(false)
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState(fromCohort ? 'instructor' : '')
  const [cohortId, setCohortId] = useState(fromCohort ?? '')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const grantableNow = list.data?.grantable ?? []
  const choice = grantableNow.includes(newRole) ? newRole : (grantableNow[0] ?? '')
  const status = useRef<HTMLDivElement>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const title = staffPageLabel(current?.kind)
  useEffect(() => {
    document.title = title
  }, [title])
  // After a remove, or an error, the clicked button is gone or the result is elsewhere: move focus to the message.
  const focusStatus = useRef(false)
  useEffect(() => {
    if (message && focusStatus.current) status.current?.focus()
    focusStatus.current = false
  }, [message])
  const cohorts = useLoad<CohortListItem[]>(
    allowed && panelOpen && choice === 'instructor' ? `${base}/cohorts` : null
  )

  if (!allowed) {
    return (
      <Notice title="Page not found">
        This page is not available for your role in this workspace.
      </Notice>
    )
  }
  if (list.error) return errorNotice(list.error)
  if (!list.data) return <p className="dash-loading">Loading people…</p>
  const { grantable } = list.data

  const all: Row[] = [
    ...list.data.members.map((m) => ({
      key: `m-${m.membershipId}`,
      kind: 'member' as const,
      id: m.membershipId,
      name: m.name,
      email: m.email,
      role: m.role,
      cohort: m.cohort,
    })),
    ...(list.data.invites ?? []).map((i) => ({
      key: `i-${i.inviteId}`,
      kind: 'invite' as const,
      id: i.inviteId,
      name: null,
      email: i.email,
      role: i.role,
      cohort: i.cohort,
      createdAt: i.createdAt,
    })),
  ]
  const scoped = fromCohort !== null && !showAll
  const inScope = scoped ? all.filter((r) => r.cohort?.id === fromCohort) : all
  const label = (r: Row) => (r.name ?? r.email ?? '').toLowerCase()
  const needle = search.trim().toLowerCase()
  const rows = inScope
    .filter((r) => !filter || (filter === 'invited' ? r.kind === 'invite' : r.role === filter))
    .filter((r) => !needle || `${r.name ?? ''} ${r.email ?? ''}`.toLowerCase().includes(needle))
    .sort((a, b) => rank(b.role) - rank(a.role) || label(a).localeCompare(label(b)))
  const counts = [...ROLE_ORDER]
    .reverse()
    .map((r) => ({
      role: r as string,
      n: inScope.filter((x) => x.kind === 'member' && x.role === r).length,
    }))
    .filter((c) => c.n > 0)
  const invitedCount = inScope.filter((r) => r.kind === 'invite').length

  function closePanel() {
    setPanelOpen(false)
    setAddError(null)
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    setAddError(null)
    const who = email.trim()
    try {
      const out = await send<{ status: 'added' | 'invited'; member?: { name?: string | null } }>(
        'POST',
        `${base}/members`,
        { email: who, role: choice, ...(choice === 'instructor' ? { cohortId } : {}) }
      )
      setMessage({
        kind: 'ok',
        text:
          out?.status === 'invited'
            ? `Invited ${who} as ${roleName(choice)}. They get access when they sign in with this email.`
            : `Added ${out?.member?.name ?? who} as ${roleName(choice)}.`,
      })
      setFresh(who.toLowerCase())
      setTimeout(() => setFresh(null), 3500)
      setEmail('')
      setCohortId(fromCohort ?? '')
      list.reload()
      closePanel()
    } catch (err) {
      setAddError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function act(r: Row) {
    const who = r.name ?? r.email ?? 'this person'
    const ok = window.confirm(
      r.kind === 'invite'
        ? `Withdraw the invitation for ${r.email} as ${roleName(r.role).toLowerCase()}? They will not get this role when they sign in.`
        : `Remove ${who} as ${roleName(r.role).toLowerCase()} here? They keep any access they have in other workspaces.`
    )
    if (!ok) return
    setBusy(true)
    setMessage(null)
    focusStatus.current = true
    try {
      await send(
        'DELETE',
        r.kind === 'invite'
          ? `${base}/members/invites/${encodeURIComponent(r.id)}`
          : `${base}/members/${encodeURIComponent(r.id)}`
      )
      setMessage({
        kind: 'ok',
        text: r.kind === 'invite' ? `Withdrew the invitation for ${r.email}.` : `Removed ${who}.`,
      })
      list.reload()
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const cohortName = fromCohort ? all.find((r) => r.cohort?.id === fromCohort)?.cohort?.name : null
  return (
    <section className="dash-section at" aria-labelledby="h-members">
      <div className="dash-head">
        <div>
          <h1 className="dash-h2" id="h-members">
            {title}
          </h1>
          <p className="dash-sub">
            {current?.name}. People who hold a role in this workspace, and what each can do.
          </p>
        </div>
        {grantable.length > 0 && (
          <button type="button" className="dash-btn" onClick={() => setPanelOpen(true)}>
            Add person
          </button>
        )}
      </div>

      {panelOpen && grantable.length > 0 && (
        <Modal
          title="Add person"
          onClose={closePanel}
          dirty={email.trim() !== ''}
          footer={
            <>
              <button
                type="button"
                className="dash-btn-quiet"
                onClick={() => {
                  if (email.trim() === '' || window.confirm(UNSAVED_PROMPT)) closePanel()
                }}
              >
                Cancel
              </button>
              <button type="submit" form="add-person-form" className="dash-btn" disabled={busy}>
                Add person
              </button>
            </>
          }
        >
          <form id="add-person-form" className="dash-form" onSubmit={add}>
            <label className="dash-field">
              <span>Email</span>
              <input
                data-autofocus
                type="email"
                required
                value={email}
                placeholder="name@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="dash-field">
              <span>Role</span>
              <select
                value={choice}
                aria-describedby="member-role-about"
                onChange={(e) => setNewRole(e.target.value)}
              >
                {grantable.map((r) => (
                  <option key={r} value={r}>
                    {roleName(r)}
                  </option>
                ))}
              </select>
            </label>
            <small id="member-role-about" className="dash-muted">
              {ROLE_ABOUT[choice]}
            </small>
            {choice === 'instructor' && (
              <label className="dash-field">
                <span>Cohort they teach</span>
                <select required value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
                  <option value="">Choose a cohort</option>
                  {(cohorts.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {addError && (
              <p className="dash-error" role="alert">
                {addError}
              </p>
            )}
          </form>
        </Modal>
      )}

      {fromCohort !== null && (
        <p className="mb-scope">
          {scoped ? `Showing staff of ${cohortName ?? 'this cohort'}.` : 'Showing everyone.'}
          <button type="button" className="at-link" onClick={() => setShowAll(scoped)}>
            {scoped ? 'Show everyone' : 'Show only this cohort'}
          </button>
        </p>
      )}

      {counts.length + invitedCount > 0 && (
        <dl className="at-strip" aria-label="People by role">
          {counts.map((c) => (
            <div className="at-stat" key={c.role}>
              <dt>{ROLE_LABEL[c.role] ?? c.role}</dt>
              <dd>{c.n}</dd>
            </div>
          ))}
          {invitedCount > 0 && (
            <div className="at-stat">
              <dt>Invited</dt>
              <dd>{invitedCount}</dd>
            </div>
          )}
        </dl>
      )}

      {message && (
        <div
          ref={status}
          tabIndex={-1}
          className={message.kind === 'error' ? 'mb-status mb-status-error' : 'mb-status'}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)}>
            Dismiss
          </button>
        </div>
      )}

      {inScope.length === 0 ? (
        <div className="dash-empty">
          <h2 className="dash-card-title">No one is listed yet</h2>
          <p>Use Add person to give someone a role here.</p>
        </div>
      ) : (
        <>
          <div className="mb-filters">
            {[
              { id: '', label: 'All' },
              ...counts.map((c) => ({ id: c.role, label: ROLE_LABEL[c.role] ?? c.role })),
              ...(invitedCount > 0 ? [{ id: 'invited', label: 'Invited' }] : []),
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className="dash-chip dash-chip-btn"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
            <input
              className="mb-search"
              type="search"
              aria-label="Search people"
              placeholder="Search people"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="dash-tablewrap">
            <table className="dash-table mb-grid" aria-label="People with a role here">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Role</th>
                  <th scope="col">Applies to</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="dash-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.key}
                    className={fresh && r.email?.toLowerCase() === fresh ? 'mb-new' : undefined}
                  >
                    <th scope="row">
                      {r.name ?? r.email}
                      {r.name && r.email && <span className="dash-muted at-loc">{r.email}</span>}
                    </th>
                    <td data-label="Role">
                      <RoleChip role={r.role} />
                    </td>
                    <td data-label="Applies to">{r.cohort ? r.cohort.name : 'Whole workspace'}</td>
                    <td data-label="Status">
                      {r.kind === 'invite' ? (
                        <>
                          Invited{r.createdAt ? ` ${dateShort(r.createdAt)}` : ''}
                          <span className="dash-muted mb-wait">waiting for them to sign in</span>
                        </>
                      ) : (
                        'Active'
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="dash-btn-quiet"
                        disabled={busy}
                        aria-label={`${r.kind === 'invite' ? 'Withdraw invitation for' : 'Remove'} ${r.name ?? r.email ?? 'this person'}, ${roleName(r.role).toLowerCase()}${r.cohort ? `, ${r.cohort.name}` : ''}`}
                        onClick={() => void act(r)}
                      >
                        {r.kind === 'invite' ? 'Withdraw' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="dash-muted">No one matches.</p>}
          </div>
        </>
      )}
    </section>
  )
}
