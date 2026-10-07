import type { LearnConnection, LearnTool, LearnToolList } from '@id/types'
import { useRef, useState } from 'react'
import { useApiSend, useLoad } from './api'
import { SYSTEM_ADMIN } from './AdminPages'
import { useApp } from './app-context'
import { ConnectionForm, type ConnectionBody } from './ConnectionForm'
import { Notice } from './DashboardShell'
import { draftOf, ToolForm, type ToolBody, type ToolDraft } from './ToolForm'
import { ToolsHistory } from './ToolsHistory'
import { useRole } from './shared'
import {
  accessSummary,
  hostOf,
  KIND_LABEL,
  normalizeSelection,
  pickable,
  type PickWs,
} from './toolsLogic'

type Panel =
  | { type: 'tool'; editing: LearnTool | null; connectionId: string }
  | { type: 'connection'; editing: LearnConnection | null }

/** The connected tools a course item can send a learner to. A system administrator manages them. */
export function ToolsPage() {
  const role = useRole()
  const { workspaces, href } = useApp()
  const { data: loaded, error, loading, reload } = useLoad<LearnToolList>('/learn/tools')
  // A failed refresh after a save must not blank the page and hide that the save went through.
  const kept = useRef<LearnToolList | null>(null)
  if (loaded) kept.current = loaded
  const data = loaded ?? kept.current
  const send = useApiSend()
  const [panel, setPanel] = useState<Panel | null>(null)
  const [draft, setDraft] = useState<ToolDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [changes, setChanges] = useState(0)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  if (role !== SYSTEM_ADMIN)
    return (
      <Notice title="Your account does not have access">
        The admin tools are only open to system admins.
      </Notice>
    )
  if (error && !data)
    return <Notice title="Could not load the tools">Try again in a moment.</Notice>
  if (loading && !data) return <p className="dash-loading">Loading…</p>
  const tools = data?.tools ?? []
  const connections = data?.connections ?? []
  const choices: PickWs[] = pickable(workspaces ?? [])

  /** Runs one change; resolves to the error message, or null once it went through. */
  async function perform(action: () => Promise<unknown>, ok: string): Promise<string | null> {
    setBusy(true)
    setMessage(null)
    try {
      await action()
      setMessage({ kind: 'ok', text: ok })
      setChanges((n) => n + 1)
      reload()
      return null
    } catch (err) {
      return (err as Error).message
    } finally {
      setBusy(false)
    }
  }

  async function saveTool(body: ToolBody): Promise<string | null> {
    const editing = panel?.type === 'tool' ? panel.editing : null
    const err = await perform(
      () =>
        editing
          ? send('PUT', `/learn/tools/${encodeURIComponent(editing.toolId)}`, body)
          : send('POST', '/learn/tools', body),
      `${body.name} ${editing ? 'saved' : 'added'}.`
    )
    if (!err) closePanel()
    return err
  }

  async function saveConnection(body: ConnectionBody): Promise<string | null> {
    const editing = panel?.type === 'connection' ? panel.editing : null
    const err = await perform(
      () =>
        editing
          ? send('PUT', `/learn/tools/connections/${encodeURIComponent(editing.id)}`, body)
          : send('POST', '/learn/tools/connections', body),
      `${body.name} ${editing ? 'saved' : 'added'}.`
    )
    if (!err) closePanel()
    return err
  }

  async function removeItem(label: string, path: string, ok: string, open: boolean) {
    if (!window.confirm(label)) return
    const err = await perform(() => send('DELETE', path), ok)
    if (err) setMessage({ kind: 'error', text: err })
    else if (open) closePanel()
  }

  function closePanel() {
    setPanel(null)
    setDraft(null)
  }

  function openTool(t: LearnTool | null, connectionId: string) {
    setMessage(null)
    setDraft({
      ...draftOf(t, connectionId),
      selected: normalizeSelection(t?.workspaceIds ?? [], choices),
    })
    setPanel({ type: 'tool', editing: t, connectionId })
  }

  function openConnection(c: LearnConnection | null) {
    setMessage(null)
    setDraft(null)
    setPanel({ type: 'connection', editing: c })
  }

  const toolPanel = panel?.type === 'tool' ? panel : null
  const connPanel = panel?.type === 'connection' ? panel : null

  const toolRow = (t: LearnTool) => (
    <li key={t.toolId} className="dash-tl-item dash-tl-tool">
      <div className="dash-tl-main">
        <p className="dash-tl-name">
          <strong>{t.name}</strong> <code>{t.toolId}</code>
        </p>
        <div className="dash-tl-chiprow">
          <span className="dash-chip">{KIND_LABEL[t.kind]}</span>
          <span className={t.enabled ? 'dash-chip dash-chip-on' : 'dash-chip'}>
            {t.enabled ? 'On' : 'Off'}
          </span>
        </div>
        <dl className="dash-tl-facts">
          <div>
            <dt>Available to</dt>
            <dd
              title={
                t.workspaceIds.length
                  ? t.workspaceIds
                      .map(
                        (id) =>
                          (workspaces ?? []).find((w) => w.id === id)?.name ??
                          'a workspace you cannot see'
                      )
                      .join(', ')
                  : undefined
              }
            >
              {accessSummary(t.workspaceIds)}
            </dd>
          </div>
        </dl>
      </div>
      <div className="dash-tl-rowbtns">
        <button
          type="button"
          className="dash-btn-quiet"
          disabled={busy}
          aria-label={`Edit ${t.name}`}
          onClick={() => openTool(t, t.connectionId)}
        >
          Edit
        </button>
        <button
          type="button"
          className="dash-btn-quiet"
          disabled={busy}
          aria-label={`Remove ${t.name}`}
          onClick={() =>
            void removeItem(
              `Remove ${t.name}? Course items that use it stop opening until it is back.`,
              `/learn/tools/${encodeURIComponent(t.toolId)}`,
              `${t.name} removed.`,
              toolPanel?.editing?.toolId === t.toolId
            )
          }
        >
          Remove
        </button>
      </div>
    </li>
  )

  return (
    <>
      <a className="dash-back" href={href('/lms/admin')}>
        ← Admin
      </a>
      <header className="dash-tl-pagehead">
        <div>
          <h1 className="dash-h2">Connected tools</h1>
          <p className="dash-sub">
            The tools a course item can send a learner to, such as Interview Differently. Each tool
            launches through a connection, a registration with the tool's vendor. When a learner
            opens one, the tool receives their name and ID, so only a system administrator can add
            or change them.
          </p>
        </div>
        <div className="dash-tl-pageactions">
          <button
            type="button"
            className="dash-btn"
            disabled={busy}
            onClick={() => openConnection(null)}
          >
            Add a connection
          </button>
        </div>
      </header>

      {message && (
        <p
          className={message.kind === 'error' ? 'dash-error dash-tl-msg' : 'dash-banner'}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}

      {connPanel && (
        <ConnectionForm
          key={connPanel.editing?.id ?? 'new'}
          editing={connPanel.editing}
          busy={busy}
          onSave={saveConnection}
          onCancel={closePanel}
        />
      )}

      {connections.length === 0 && (
        <div className="dash-tl-emptybox dash-tl-section-card">
          <p>
            <strong>No connections yet.</strong>
          </p>
          <p className="dash-muted">A tool launches through a connection, so add one first.</p>
          <button
            type="button"
            className="dash-btn"
            disabled={busy}
            onClick={() => openConnection(null)}
          >
            Add a connection
          </button>
        </div>
      )}

      {connections.map((c) => {
        const own = tools.filter((t) => t.connectionId === c.id)
        const formHere = toolPanel && toolPanel.connectionId === c.id
        return (
          <section
            key={c.id}
            className="dash-card dash-tl-section-card"
            aria-labelledby={`h-conn-${c.id}`}
          >
            <div className="dash-tl-head dash-tl-connhead">
              <div className="dash-tl-main">
                <h2 className="dash-card-title" id={`h-conn-${c.id}`}>
                  {c.name} <code className="dash-tl-code">{c.id}</code>
                </h2>
                <dl className="dash-tl-facts">
                  <div>
                    <dt>Client id</dt>
                    <dd className="dash-tl-break">{c.clientId}</dd>
                  </div>
                  <div>
                    <dt>Host</dt>
                    <dd className="dash-tl-break" title={c.launchUrl}>
                      {hostOf(c.launchUrl)}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="dash-tl-rowbtns">
                <button
                  type="button"
                  className="dash-btn-quiet"
                  disabled={busy}
                  aria-label={`Edit connection ${c.name}`}
                  onClick={() => openConnection(c)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="dash-btn-quiet"
                  disabled={busy || c.toolCount > 0}
                  aria-label={`Remove connection ${c.name}`}
                  aria-describedby={c.toolCount > 0 ? `rm-hint-${c.id}` : undefined}
                  onClick={() =>
                    void removeItem(
                      `Remove ${c.name}?`,
                      `/learn/tools/connections/${encodeURIComponent(c.id)}`,
                      `${c.name} removed.`,
                      connPanel?.editing?.id === c.id
                    )
                  }
                >
                  Remove
                </button>
                {c.toolCount > 0 && (
                  <small className="dash-muted dash-tl-hint" id={`rm-hint-${c.id}`}>
                    Remove its tools first.
                  </small>
                )}
              </div>
            </div>

            <div className="dash-tl-nest">
              <div className="dash-tl-head">
                <h3 className="dash-tl-subtitle">Tools on this connection ({own.length})</h3>
                {!formHere && (
                  <button
                    type="button"
                    className="dash-btn-secondary dash-tl-small"
                    disabled={busy}
                    onClick={() => openTool(null, c.id)}
                  >
                    Add a tool
                  </button>
                )}
              </div>
              {formHere && draft && (
                <ToolForm
                  key={toolPanel.editing?.toolId ?? `new-${c.id}`}
                  editing={toolPanel.editing}
                  draft={draft}
                  setDraft={setDraft}
                  connections={connections}
                  workspaces={choices}
                  stored={toolPanel.editing?.workspaceIds ?? []}
                  busy={busy}
                  onSave={saveTool}
                  onCancel={closePanel}
                />
              )}
              {own.length === 0 ? (
                <p className="dash-muted dash-tl-empty">No tools yet on this connection.</p>
              ) : (
                <ul className="dash-tl-rows">{own.map(toolRow)}</ul>
              )}
            </div>
          </section>
        )
      })}

      <ToolsHistory
        tools={tools}
        connections={connections}
        workspaces={workspaces ?? []}
        refreshKey={changes}
      />
    </>
  )
}
