import { useId, useState } from 'react'
import {
  filterGroups,
  groupWorkspaces,
  isCovered,
  toggleWorkspace,
  visibleIds,
  type PickWs,
} from './toolsLogic'

export type Access = 'all' | 'chosen'

/**
 * Who may use a tool: every workspace, or chosen agencies and providers. Choosing an agency covers
 * every provider under it, so those providers are shown ticked and locked rather than chosen twice.
 */
export function WorkspacePicker({
  access,
  onAccess,
  selected,
  onSelected,
  workspaces,
  hidden,
}: {
  access: Access
  onAccess: (a: Access) => void
  selected: string[]
  onSelected: (ids: string[]) => void
  /** Agencies and providers this person can see. */
  workspaces: PickWs[]
  /** How many stored workspaces this person cannot see; they stay on the tool. */
  hidden: number
}) {
  const [query, setQuery] = useState('')
  const uid = useId()
  const groups = filterGroups(groupWorkspaces(workspaces), query)
  const shown = visibleIds(selected, workspaces)
  const total = shown.length + hidden
  const nameOf = (id: string) => workspaces.find((w) => w.id === id)?.name ?? id

  const row = (w: PickWs, indent: boolean) => {
    const covered = isCovered(selected, w)
    return (
      <li key={w.id}>
        <label className={`dash-tl-row-pick${indent ? ' dash-tl-indent' : ''}`}>
          <input
            type="checkbox"
            checked={covered || selected.includes(w.id)}
            disabled={covered}
            onChange={() => onSelected(toggleWorkspace(selected, w, workspaces))}
          />
          <span className="dash-tl-pick-name">{w.name}</span>
          <small className="dash-muted">
            {covered ? 'Covered by agency' : w.kind === 'agency' ? 'Agency' : 'Provider'}
          </small>
        </label>
      </li>
    )
  }

  return (
    <fieldset className="dash-tl-fieldset">
      <legend className="dash-visually-hidden">Who can use it</legend>
      <div className="dash-tl-cards dash-tl-cards-2">
        <label className="dash-tl-card">
          <input
            type="radio"
            name="access"
            value="all"
            checked={access === 'all'}
            onChange={() => onAccess('all')}
          />
          <span className="dash-tl-card-body">
            <strong>Every workspace</strong>
            <small>Any agency or provider can add it to their courses.</small>
          </span>
        </label>
        <label className="dash-tl-card">
          <input
            type="radio"
            name="access"
            value="chosen"
            checked={access === 'chosen'}
            onChange={() => onAccess('chosen')}
          />
          <span className="dash-tl-card-body">
            <strong>Only the ones I choose</strong>
            <small>Limit it to certain agencies and providers.</small>
          </span>
        </label>
      </div>

      {access === 'chosen' && (
        <div className="dash-tl-picker">
          <p className="dash-muted dash-tl-help">
            Choosing an agency covers every provider that reports to it, so its providers do not
            need to be chosen as well. Organizations and colleges cannot be chosen; they use the
            tool through their agency or provider.
          </p>

          <div className="dash-tl-picker-head">
            <p className="dash-tl-count" aria-live="polite">
              <strong>{total}</strong> selected
            </p>
            {shown.length > 0 && (
              <button type="button" className="dash-btn-quiet" onClick={() => onSelected([])}>
                Clear all
              </button>
            )}
          </div>
          {shown.length > 0 && (
            <ul className="dash-tl-chips" aria-label="Selected workspaces">
              {shown.map((id) => (
                <li key={id} className="dash-chip dash-chip-on dash-tl-chip">
                  <span>{nameOf(id)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${nameOf(id)}`}
                    onClick={() => onSelected(selected.filter((x) => x !== id))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hidden > 0 && (
            <p className="dash-muted dash-tl-help">
              {hidden} more {hidden === 1 ? 'workspace' : 'workspaces'} you cannot see here{' '}
              {hidden === 1 ? 'stays' : 'stay'} on the list.
            </p>
          )}
          {total === 0 && (
            <p className="dash-error dash-tl-help">
              Nothing chosen yet. Choose at least one workspace, or switch to "Every workspace".
            </p>
          )}

          <label className="dash-visually-hidden" htmlFor={`${uid}-q`}>
            Search agencies and providers
          </label>
          <input
            id={`${uid}-q`}
            type="search"
            className="dash-chooser-search dash-tl-search"
            placeholder="Search workspaces"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault()
            }}
          />

          <div className="dash-tl-list" role="group" aria-label="Agencies and providers">
            {workspaces.length === 0 && (
              <p className="dash-muted dash-tl-empty">There are no agencies or providers yet.</p>
            )}
            {workspaces.length > 0 && groups.length === 0 && (
              <p className="dash-muted dash-tl-empty">No workspaces match "{query.trim()}".</p>
            )}
            {groups.map((g) => (
              <ul key={g.agency?.id ?? 'loose'} className="dash-tl-group">
                {g.agency && row(g.agency, false)}
                {g.providers.map((p) => row(p, g.agency !== null))}
              </ul>
            ))}
          </div>
        </div>
      )}
    </fieldset>
  )
}
