import type { LearnConnection, LearnRegistryChange } from '@id/types'
import { useEffect, useRef, useState } from 'react'
import { useLoad } from './api'
import {
  changeLines,
  dayLabel,
  filterHistory,
  timeOf,
  truncate,
  type HistoryKind,
  type HistoryLookup,
} from './toolsLogic'

/** Who changed what in the registry, newest first. Loads only once it is opened. */
export function ToolsHistory({
  connections,
  workspaces,
  refreshKey,
}: {
  connections: LearnConnection[]
  workspaces: { id: string; name: string }[]
  /** Changes whenever the registry changes, so the list reloads. */
  refreshKey: number
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<HistoryKind>('all')
  const path = open ? '/learn/tools/history' : null
  const { data, error, loading, reload } = useLoad<LearnRegistryChange[]>(path)
  const kept = useRef<LearnRegistryChange[] | null>(null)
  if (data) kept.current = data
  const entries = data ?? kept.current

  const first = useRef(true)
  useEffect(() => {
    if (first.current) first.current = false
    else reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const lookup: HistoryLookup = {
    workspaceName: (id) => workspaces.find((w) => w.id === id)?.name ?? null,
    connectionName: (id) => connections.find((c) => c.id === id)?.name ?? null,
  }

  const shown = entries ? filterHistory(entries, lookup, query, kind) : []
  const days: [string, LearnRegistryChange[]][] = []
  for (const c of shown) {
    const day = dayLabel(c.createdAt)
    const last = days[days.length - 1]
    if (last && last[0] === day) last[1].push(c)
    else days.push([day, [c]])
  }

  return (
    <section className="dash-card dash-tl-section-card" aria-labelledby="h-history">
      <div className="dash-tl-head">
        <h2 className="dash-card-title" id="h-history">
          History
        </h2>
        <button
          type="button"
          className="dash-btn-secondary dash-tl-small"
          aria-expanded={open}
          aria-controls="tools-history-body"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide history' : 'Show history'}
        </button>
      </div>
      <p className="dash-muted dash-tl-help">
        Every change to a tool or connection, and who made it.
      </p>
      {open && (
        <div id="tools-history-body">
          <div className="dash-hx-tools" role="search">
            <input
              className="dash-chooser-search"
              type="search"
              placeholder="Search by person, tool, connection or field"
              aria-label="Search the history"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="dash-chooser-kinds">
              {KINDS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  className={`dash-chip dash-chip-btn${kind === k.key ? ' dash-chip-on' : ''}`}
                  aria-pressed={kind === k.key}
                  onClick={() => setKind(k.key)}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          {error && !entries && (
            <p className="dash-error" role="alert">
              Could not load the history. Try again in a moment.
            </p>
          )}
          {loading && !entries && <p className="dash-loading">Loading…</p>}
          {entries && entries.length === 0 && (
            <p className="dash-muted dash-tl-empty">No changes recorded yet.</p>
          )}
          {entries && entries.length > 0 && shown.length === 0 && (
            <p className="dash-muted dash-tl-empty">No changes match your search.</p>
          )}
          {shown.length > 0 && (
            <div aria-busy={loading}>
              {days.map(([day, rows]) => (
                <section key={day} className="dash-hx-day" aria-label={day}>
                  <h3 className="dash-hx-dayhead">{day}</h3>
                  <ol className="dash-hx-list">
                    {rows.map((c) => (
                      <Entry key={c.id} change={c} lookup={lookup} />
                    ))}
                  </ol>
                </section>
              ))}
              {entries && entries.length >= 200 && (
                <p className="dash-muted dash-hx-note">Showing the latest 200 changes.</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

const KINDS: { key: HistoryKind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'tool', label: 'Tools' },
  { key: 'connection', label: 'Connections' },
]
const ACTION = {
  created: { label: 'Added', cls: 'dash-hx-added' },
  updated: { label: 'Changed', cls: 'dash-hx-changed' },
  removed: { label: 'Removed', cls: 'dash-hx-removed' },
} as const

/** One change: what happened and to what, who and when, and the fields (folded away when there are many). */
function Entry({ change: c, lookup }: { change: LearnRegistryChange; lookup: HistoryLookup }) {
  const lines = changeLines(c, lookup)
  const inline = c.action === 'updated' && lines.length <= 3
  const action = ACTION[c.action]
  const detail = (
    <ul className="dash-hx-lines">
      {lines.map((l) => (
        <li key={l.label}>
          <span className="dash-hx-field">{l.label}</span>
          <span>
            {l.from !== null && (
              <>
                <Value text={l.from} /> {l.to !== null && <span aria-label="to">→</span>}{' '}
              </>
            )}
            {l.to !== null && <Value text={l.to} />}
          </span>
        </li>
      ))}
    </ul>
  )
  return (
    <li className="dash-hx-item">
      <div className="dash-hx-top">
        <span className={`dash-hx-action ${action.cls}`}>{action.label}</span>
        <span className="dash-hx-subject">
          <span className="dash-hx-type">{c.subject === 'tool' ? 'Tool' : 'Connection'}</span>{' '}
          <strong>{c.subjectName}</strong>
        </span>
        <span className="dash-hx-meta dash-muted">
          {c.userName} · <time dateTime={c.createdAt}>{timeOf(c.createdAt)}</time>
        </span>
      </div>
      {inline ? (
        detail
      ) : (
        <details className="dash-hx-more">
          <summary>
            {lines.length} {lines.length === 1 ? 'field' : 'fields'}
            <span className="dash-muted"> · {lines.map((l) => l.label).join(', ')}</span>
          </summary>
          {detail}
        </details>
      )}
    </li>
  )
}

function Value({ text }: { text: string }) {
  return (
    <span className="dash-tl-value" title={text.length > 56 ? text : undefined}>
      {truncate(text)}
    </span>
  )
}
