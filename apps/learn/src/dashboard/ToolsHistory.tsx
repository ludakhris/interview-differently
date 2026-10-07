import type { LearnConnection, LearnRegistryChange, LearnTool } from '@id/types'
import { useEffect, useRef, useState } from 'react'
import { useLoad } from './api'
import { actionPhrase, changeLines, truncate, whenOf, type HistoryLookup } from './toolsLogic'

/** Who changed what in the registry, newest first. Loads only once it is opened. */
export function ToolsHistory({
  tools,
  connections,
  workspaces,
  refreshKey,
}: {
  tools: LearnTool[]
  connections: LearnConnection[]
  workspaces: { id: string; name: string }[]
  /** Changes whenever the registry changes, so the list reloads. */
  refreshKey: number
}) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const path = open
    ? `/learn/tools/history${subject ? `?subjectId=${encodeURIComponent(subject)}` : ''}`
    : null
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
          <label className="dash-field dash-tl-filter">
            <span>Show changes to</span>
            <select value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">Everything</option>
              <optgroup label="Tools">
                {tools.map((t) => (
                  <option key={`t-${t.toolId}`} value={t.toolId}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Connections">
                {connections.map((c) => (
                  <option key={`c-${c.id}`} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {error && !entries && (
            <p className="dash-error" role="alert">
              Could not load the history. Try again in a moment.
            </p>
          )}
          {loading && !entries && <p className="dash-loading">Loading…</p>}
          {entries && entries.length === 0 && (
            <p className="dash-muted dash-tl-empty">No changes recorded yet.</p>
          )}
          {entries && entries.length > 0 && (
            <ol className="dash-tl-history" aria-busy={loading}>
              {entries.map((c) => (
                <li key={c.id}>
                  <p className="dash-tl-event">
                    <strong>{c.userName}</strong> {actionPhrase(c)}
                    <time className="dash-muted" dateTime={c.createdAt}>
                      {whenOf(c.createdAt)}
                    </time>
                  </p>
                  <ul className="dash-tl-changes">
                    {changeLines(c, lookup).map((l) => (
                      <li key={l.label}>
                        <span className="dash-tl-field">{l.label}:</span>{' '}
                        {l.from !== null && (
                          <>
                            <Value text={l.from} /> {l.to !== null && '→'}{' '}
                          </>
                        )}
                        {l.to !== null && <Value text={l.to} />}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}

function Value({ text }: { text: string }) {
  return (
    <span className="dash-tl-value" title={text.length > 56 ? text : undefined}>
      {truncate(text)}
    </span>
  )
}
