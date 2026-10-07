import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useApiSend, useLoad } from './api'
import { useApp } from './app-context'
import { Notice } from './DashboardShell'
import { errorNotice, useRole } from './shared'

/** The one role that may open the admin toolbox (API enforces it too). */
export const SYSTEM_ADMIN = 'system-admin'

const ICON = { viewBox: '0 0 48 48', 'aria-hidden': true } as const

/** A red toolbox with a yellow latch, for the page heading. */
function ToolboxIcon() {
  return (
    <svg {...ICON} width={44} height={44}>
      <path
        d="M17 14v-3a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"
        fill="none"
        stroke="#3b4252"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="5" y="14" width="38" height="26" rx="5" fill="#ef5b5b" />
      <path d="M5 24h38v-5a5 5 0 0 0-5-5H10a5 5 0 0 0-5 5z" fill="#ff8a8a" />
      <rect x="5" y="24" width="38" height="3" fill="#c93f3f" />
      <rect x="19" y="21" width="10" height="9" rx="2.5" fill="#ffc53d" stroke="#e0a100" />
      <circle cx="24" cy="25.5" r="1.5" fill="#3b4252" />
      <circle cx="11" cy="34" r="1.5" fill="#fff" opacity=".7" />
      <circle cx="37" cy="34" r="1.5" fill="#fff" opacity=".7" />
    </svg>
  )
}

/** A purple shield with a golden key and a sparkle: who may do what. */
function PermissionsIcon() {
  return (
    <svg {...ICON} width={40} height={40}>
      <path d="M22 5 8 10.5v10c0 9.5 6 16.5 14 20 8-3.5 14-10.5 14-20v-10z" fill="#7c5cff" />
      <path d="M22 5v35c8-3.5 14-10.5 14-20v-10z" fill="#5b3fd9" />
      <circle cx="22" cy="19" r="5" fill="#ffc53d" stroke="#e0a100" strokeWidth="1.5" />
      <circle cx="22" cy="19" r="1.8" fill="#5b3fd9" />
      <path d="M22 24v8m0-3h3m-3 3h3" stroke="#ffc53d" strokeWidth="3" strokeLinecap="round" />
      <path d="m38 6 1.2 3.3L42.5 10.5l-3.3 1.2L38 15l-1.2-3.3-3.3-1.2 3.3-1.2z" fill="#ffd84d" />
      <circle cx="40" cy="22" r="1.8" fill="#ff6b9d" />
    </svg>
  )
}

/** A teal plug meeting a socket: tools connected to the platform. */
function ToolsIcon() {
  return (
    <svg {...ICON} width={40} height={40}>
      <path d="M15 4v8m10-8v8" stroke="#3b4252" strokeWidth="3" strokeLinecap="round" />
      <rect x="9" y="12" width="22" height="13" rx="4" fill="#14b8a6" />
      <path d="M9 18h22v3a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4z" fill="#0f8f82" />
      <path
        d="M20 25v6a5 5 0 0 0 5 5h6"
        fill="none"
        stroke="#3b4252"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="31" y="31" width="11" height="10" rx="3" fill="#ffc53d" stroke="#e0a100" />
      <circle cx="36.5" cy="36" r="1.6" fill="#3b4252" />
      <path d="m40 8 1 2.8 2.8 1-2.8 1-1 2.8-1-2.8-2.8-1 2.8-1z" fill="#ffd84d" />
    </svg>
  )
}

/** Friendly avatar colours (background, initials), picked from the user id. */
const AVATARS = [
  ['#ffe0d6', '#b4380f'],
  ['#d9f2ec', '#0b6b5c'],
  ['#e6defc', '#4b30b8'],
  ['#fff1c2', '#8a5a00'],
  ['#ffdbe8', '#b01e57'],
  ['#d8ecfb', '#0d5a94'],
] as const
const avatarColors = (id: string): (typeof AVATARS)[number] => {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % AVATARS.length
  return AVATARS[h]
}

/** Role colours (solid, tint) and what each role can do. A role added to LEARN_ROLES later falls back to the avatar palette and no description. */
const ROLE_INFO: Record<string, { solid: string; tint: string; about: string }> = {
  '': { solid: '#4b5563', tint: '#eef0f3', about: 'Takes courses only' },
  'case-manager': { solid: '#b4380f', tint: '#ffe0d6', about: 'Reads outcomes and gradebooks' },
  'provider-admin': { solid: '#0b6b5c', tint: '#d9f2ec', about: 'Runs courses and cohorts' },
  'agency-admin': { solid: '#0d5a94', tint: '#d8ecfb', about: 'Sees every workspace' },
  'system-admin': {
    solid: '#5b3fd9',
    tint: '#ece6ff',
    about: 'Everything an agency admin can, plus system tools',
  },
}
const roleInfo = (r: string) =>
  ROLE_INFO[r] ?? { solid: avatarColors(r)[1], tint: avatarColors(r)[0], about: '' }

/** "system-admin" reads as "System admin". */
const roleLabel = (r: string): string => {
  const words = r.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const initials = (u: { displayName: string | null; email: string | null }): string =>
  (u.displayName ?? u.email ?? '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

interface AdminUser {
  id: string
  email: string | null
  displayName: string | null
  role: string | null
}

/** Admin toolbox index: one tile per system tool. */
export function AdminPage() {
  const role = useRole()
  const { href } = useApp()
  if (role !== SYSTEM_ADMIN) return <NoAccess />
  return (
    <>
      <div className="dash-admin-head">
        <span className="dash-admin-mark">
          <ToolboxIcon />
        </span>
        <div>
          <h1 className="dash-h2">Admin toolbox</h1>
          <p className="dash-sub">System tools for running the platform.</p>
        </div>
      </div>
      <ul className="dash-tools">
        <li>
          <a className="dash-tool" href={href('/lms/admin/users')}>
            <span className="dash-tool-icon">
              <PermissionsIcon />
            </span>
            <span className="dash-tool-name">User permissions</span>
            <span className="dash-tool-desc">
              Find a user and change the role they hold. Upgrade or downgrade their access.
            </span>
            <span className="dash-tool-open">Open tool →</span>
          </a>
        </li>
        <li>
          <a className="dash-tool" href={href('/lms/admin/tools')}>
            <span className="dash-tool-icon">
              <ToolsIcon />
            </span>
            <span className="dash-tool-name">Connected tools</span>
            <span className="dash-tool-desc">
              Add the tools learners are sent to, and choose which agencies and providers can use
              each one.
            </span>
            <span className="dash-tool-open">Open tool →</span>
          </a>
        </li>
        <li className="dash-tool dash-tool-soon" aria-hidden="true">
          <span className="dash-tool-name">More tools coming</span>
          <span className="dash-tool-desc">New system tools will appear here.</span>
        </li>
      </ul>
    </>
  )
}

function NoAccess() {
  return (
    <Notice title="Your account does not have access">
      The admin tools are only open to system admins.
    </Notice>
  )
}

/** Search LearnDifferently users and set the single role each one holds. */
export function AdminUsersPage() {
  const role = useRole()
  const { href } = useApp()
  const roles = useLoad<string[]>('/learn/admin/roles')
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const users = useLoad<AdminUser[]>(`/learn/admin/users?q=${encodeURIComponent(query)}`)

  if (role !== SYSTEM_ADMIN) return <NoAccess />
  if (roles.error) return errorNotice(roles.error)

  function search(e: FormEvent) {
    e.preventDefault()
    setQuery(input.trim())
  }

  return (
    <>
      <a className="dash-back" href={href('/lms/admin')}>
        ← Admin
      </a>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">User permissions</h1>
          <p className="dash-sub">
            A user holds one role, or none. Changes apply on their next page load.
          </p>
        </div>
      </div>
      <form className="dash-chooser-tools" role="search" onSubmit={search}>
        <input
          className="dash-chooser-search"
          type="search"
          placeholder="Search by email or name"
          aria-label="Search users"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="dash-btn">
          Search
        </button>
      </form>
      {users.error ? (
        errorNotice(users.error)
      ) : !users.data || !roles.data ? (
        <p className="dash-loading">Loading users…</p>
      ) : users.data.length === 0 ? (
        <p className="dash-muted">No users match “{query}”.</p>
      ) : (
        <div className="dash-matrix-wrap">
          <table className="dash-matrix">
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Role</th>
                <th scope="col">
                  <span className="dash-visually-hidden">Save</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <UserRow key={u.id} user={u} roles={roles.data!} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

/** Position in the API's least-to-most-access list; 0 for no role, null for a role it does not rank. */
const rankOf = (roles: string[], role: string): number | null =>
  role === '' ? 0 : roles.includes(role) ? roles.indexOf(role) + 1 : null

/** A coloured role chip that opens a menu of roles, each with a one-line description. */
function RoleMenu({
  value,
  current,
  roles,
  options,
  label,
  disabled,
  onChange,
}: {
  value: string
  /** The role saved today; the menu labels every other role as an upgrade or downgrade from it. */
  current: string
  /** Assignable roles, least access first. */
  roles: string[]
  /** Highest access first. */
  options: { value: string; label: string }[]
  label: string
  disabled: boolean
  onChange: (role: string) => void
}) {
  const button = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        button.current?.focus()
      }
    }
    // Fixed position: the grid scrolls sideways, which would clip an absolute menu.
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [pos])

  const selected = options.find((o) => o.value === value)
  const { solid, tint } = roleInfo(value)

  function toggle() {
    if (pos) return setPos(null)
    const r = button.current?.getBoundingClientRect()
    if (r)
      setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 328)) })
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className="dash-rolechip"
        style={{ '--role': solid, '--role-tint': tint } as CSSProperties}
        aria-haspopup="listbox"
        aria-expanded={pos !== null}
        aria-label={`Role for ${label}: ${selected?.label ?? value}. Change`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          toggle()
        }}
      >
        {selected?.label ?? value}
        <span aria-hidden="true">▾</span>
      </button>
      {pos && (
        <ul
          className="dash-rolemenu"
          role="listbox"
          style={pos}
          onClick={(e) => e.stopPropagation()}
        >
          <li className="dash-rolemenu-head" role="presentation">
            Change role
          </li>
          {options.map((o) => {
            const info = roleInfo(o.value)
            const here = rankOf(roles, current)
            const there = rankOf(roles, o.value)
            const move =
              o.value === current
                ? { cls: 'dash-move-cur', text: 'Current' }
                : here === null || there === null
                  ? null
                  : there > here
                    ? { cls: 'dash-move-up', text: '↑ Upgrade' }
                    : { cls: 'dash-move-down', text: '↓ Downgrade' }
            return (
              <li
                key={o.value || 'none'}
                role="presentation"
                className={o.value === current ? 'dash-rolemenu-cur' : undefined}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  className={o.value === value ? 'dash-roleopt dash-roleopt-on' : 'dash-roleopt'}
                  onClick={() => {
                    setPos(null)
                    onChange(o.value)
                  }}
                >
                  <span className="dash-roledot" style={{ background: info.solid }} />
                  <span className="dash-roleopt-text">
                    {o.label}
                    {info.about && <small>{info.about}</small>}
                  </span>
                  {move && <span className={`dash-move ${move.cls}`}>{move.text}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function UserRow({ user, roles }: { user: AdminUser; roles: string[] }) {
  const send = useApiSend()
  const [saved, setSaved] = useState(user.role ?? '')
  const [choice, setChoice] = useState(user.role ?? '')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A new search can hand this row a different user.
  useEffect(() => {
    setSaved(user.role ?? '')
    setChoice(user.role ?? '')
    setConfirming(false)
    setError(null)
  }, [user.id, user.role])

  const from = rankOf(roles, saved)
  const to = rankOf(roles, choice)
  const downgrade = from !== null && to !== null && to < from

  async function save() {
    // Taking access away asks once more.
    if (downgrade && !confirming) return setConfirming(true)
    setConfirming(false)
    setBusy(true)
    setError(null)
    try {
      const out = await send<AdminUser>(
        'PUT',
        `/learn/admin/users/${encodeURIComponent(user.id)}/role`,
        {
          role: choice || null,
        }
      )
      setSaved(out.role ?? '')
      setChoice(out.role ?? '')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const changed = choice !== saved
  const [bg, fg] = avatarColors(user.id)
  return (
    <tr className={changed ? 'dash-matrix-changed' : undefined}>
      <th scope="row">
        <div className="dash-user-top">
          <span
            className="dash-user-avatar"
            aria-hidden="true"
            style={{ background: bg, color: fg }}
          >
            {initials(user)}
          </span>
          <div className="dash-user-who">
            <span className="dash-user-name">{user.displayName ?? user.email ?? user.id}</span>
            {user.displayName && user.email && <span className="dash-muted">{user.email}</span>}
          </div>
        </div>
        {error && (
          <p className="dash-error" role="alert">
            {error}
          </p>
        )}
      </th>
      <td>
        <RoleMenu
          value={choice}
          current={saved}
          roles={roles}
          label={user.email ?? user.id}
          disabled={busy}
          onChange={(r) => {
            setChoice(r)
            setConfirming(false)
          }}
          options={[
            // A role set outside this list (e.g. by hand in Clerk) stays visible.
            ...(saved && !roles.includes(saved) ? [{ value: saved, label: roleLabel(saved) }] : []),
            ...[...roles].reverse().map((r) => ({ value: r, label: roleLabel(r) })),
            { value: '', label: 'Learner' },
          ]}
        />
      </td>
      <td className="dash-matrix-actions">
        {changed && (
          <>
            <button
              type="button"
              className={confirming ? 'dash-btn dash-btn-warn' : 'dash-btn'}
              disabled={busy}
              onClick={save}
            >
              {busy ? 'Saving…' : confirming ? 'Confirm downgrade' : 'Save'}
            </button>
            <button
              type="button"
              className="dash-btn-quiet"
              disabled={busy}
              onClick={() => {
                setChoice(saved)
                setConfirming(false)
              }}
            >
              Cancel
            </button>
          </>
        )}
      </td>
    </tr>
  )
}
