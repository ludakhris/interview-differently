import type { LearnConnection, LearnTool } from '@id/types'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { WorkspacePicker, type Access } from './WorkspacePicker'
import { hiddenIds, ID_PATTERN, visibleIds, type PickWs } from './toolsLogic'

export interface ToolDraft {
  toolId: string
  name: string
  kind: 'interview' | 'assessment'
  connectionId: string
  retries: boolean
  labelable: boolean
  enabled: boolean
  access: Access
  /** Chosen agencies and providers this person can see. */
  selected: string[]
}

export interface ToolBody {
  toolId: string
  connectionId: string
  name: string
  kind: 'interview' | 'assessment'
  retries: boolean
  labelable: boolean
  enabled: boolean
  workspaceIds: string[]
}

/** Practice labs can be retried and never stand in for an assessment; graded assessments are the reverse. */
export const kindDefaults = (kind: ToolDraft['kind']) => ({
  retries: kind === 'interview',
  labelable: kind === 'assessment',
})

export function draftOf(t: LearnTool | null, connectionId: string): ToolDraft {
  const kind = t?.kind ?? 'interview'
  return {
    toolId: t?.toolId ?? '',
    name: t?.name ?? '',
    kind,
    connectionId: t?.connectionId ?? connectionId,
    retries: t?.retries ?? kindDefaults(kind).retries,
    labelable: t?.labelable ?? kindDefaults(kind).labelable,
    enabled: t?.enabled ?? true,
    access: t && t.workspaceIds.length > 0 ? 'chosen' : 'all',
    selected: t?.workspaceIds ?? [],
  }
}

const KINDS = [
  {
    value: 'interview',
    title: 'Practice lab',
    text: 'Learners practise and can open it again. Not graded toward the course.',
  },
  {
    value: 'assessment',
    title: 'Graded assessment',
    text: 'A scored question bank with limited attempts. Can be a pre or post assessment.',
  },
] as const

export function ToolForm({
  editing,
  draft,
  setDraft,
  connections,
  workspaces,
  stored,
  busy,
  onSave,
  onCancel,
}: {
  /** The tool being changed, or null for a new one. */
  editing: LearnTool | null
  draft: ToolDraft
  setDraft: (d: ToolDraft) => void
  connections: LearnConnection[]
  /** Agencies and providers this person can see. */
  workspaces: PickWs[]
  /** The workspace ids saved on the tool now, including ones this person cannot see. */
  stored: string[]
  busy: boolean
  /** Resolves to an error message, or null when saved. */
  onSave: (body: ToolBody) => Promise<string | null>
  onCancel: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
    heading.current?.scrollIntoView?.({ block: 'start' })
  }, [])
  const set = (patch: Partial<ToolDraft>) => setDraft({ ...draft, ...patch })
  const hidden = hiddenIds(stored, workspaces)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const toolId = editing ? editing.toolId : draft.toolId.trim()
    if (!editing && !ID_PATTERN.test(toolId))
      return setError('The tool id must be 2 to 40 lowercase letters, numbers or dashes.')
    const workspaceIds =
      draft.access === 'chosen' ? [...visibleIds(draft.selected, workspaces), ...hidden] : []
    if (draft.access === 'chosen' && workspaceIds.length === 0)
      // Nothing chosen would save as "every workspace": the opposite of what was asked for.
      return setError('Choose at least one workspace, or pick "Every workspace".')
    setError(null)
    const message = await onSave({
      toolId,
      connectionId: draft.connectionId,
      name: draft.name.trim(),
      kind: draft.kind,
      retries: draft.retries,
      labelable: draft.kind === 'assessment' && draft.labelable,
      enabled: draft.enabled,
      workspaceIds,
    })
    if (message) setError(message)
  }

  return (
    <section className="dash-card dash-tl-panel" aria-labelledby="h-tool-form">
      <h2 className="dash-card-title" id="h-tool-form" tabIndex={-1} ref={heading}>
        {editing ? `Edit ${editing.name}` : 'Add a tool'}
      </h2>
      <p className="dash-tl-context">
        On connection: <strong>{connections.find((c) => c.id === draft.connectionId)?.name}</strong>
      </p>
      <form className="dash-tl-form" onSubmit={(e) => void submit(e)} noValidate={false}>
        <section className="dash-tl-section" aria-labelledby="tf-basics">
          <h3 id="tf-basics">Basics</h3>
          <div className="dash-field-row">
            {!editing && (
              <label className="dash-field">
                <span>Tool id</span>
                <input
                  required
                  maxLength={40}
                  placeholder="acme-labs"
                  value={draft.toolId}
                  onChange={(e) => set({ toolId: e.target.value })}
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <small className="dash-muted">
                  2 to 40 lowercase letters, numbers and dashes. It cannot change later.
                </small>
              </label>
            )}
            <label className="dash-field">
              <span>Name</span>
              <input
                required
                maxLength={80}
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
              />
              <small className="dash-muted">What admins and course authors see.</small>
            </label>
          </div>
          <fieldset className="dash-tl-fieldset">
            <legend>Type</legend>
            <div className="dash-tl-cards dash-tl-cards-2">
              {KINDS.map((k) => (
                <label key={k.value} className="dash-tl-card">
                  <input
                    type="radio"
                    name="kind"
                    value={k.value}
                    checked={draft.kind === k.value}
                    onChange={() =>
                      set({ kind: k.value, ...(editing ? {} : kindDefaults(k.value)) })
                    }
                  />
                  <span className="dash-tl-card-body">
                    <strong>{k.title}</strong>
                    <small>{k.text}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        {editing && connections.length > 1 && (
          <details className="dash-tl-advanced">
            <summary>Advanced: move to another connection</summary>
            <label className="dash-field">
              <span>Launches through</span>
              <select
                value={draft.connectionId}
                onChange={(e) => set({ connectionId: e.target.value })}
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <small className="dash-muted">
                Course items keep pointing at this tool; only the vendor registration it launches
                through changes.
              </small>
            </label>
          </details>
        )}

        <section className="dash-tl-section" aria-labelledby="tf-behave">
          <h3 id="tf-behave">Behaviour</h3>
          <Switch
            checked={draft.retries}
            onChange={(v) => set({ retries: v })}
            title="Learners can open it again"
            text="After finishing, a learner can start another attempt."
          />
          {draft.kind === 'assessment' && (
            <Switch
              checked={draft.labelable}
              onChange={(v) => set({ labelable: v })}
              title="Can be a pre or post assessment"
              text="A course can mark an item for it as its pre or post assessment."
            />
          )}
          <Switch
            checked={draft.enabled}
            onChange={(v) => set({ enabled: v })}
            title={draft.enabled ? 'On' : 'Off'}
            text="Turn it off to stop it opening and hide it from the course editor. Items that use it keep their settings."
          />
        </section>

        <section className="dash-tl-section" aria-labelledby="tf-who">
          <h3 id="tf-who">Who can use it</h3>
          <WorkspacePicker
            access={draft.access}
            onAccess={(access) => set({ access })}
            selected={draft.selected}
            onSelected={(selected) => set({ selected })}
            workspaces={workspaces}
            hidden={hidden.length}
          />
        </section>

        <div className="dash-tl-actions">
          {error && (
            <p className="dash-error dash-tl-actions-msg" role="alert">
              {error}
            </p>
          )}
          <div className="dash-tl-actions-btns">
            <button className="dash-btn" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add tool'}
            </button>
            <button type="button" className="dash-btn-secondary" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </form>
    </section>
  )
}

/** A labelled on/off switch: a native checkbox, so the keyboard and screen readers just work. */
function Switch({
  checked,
  onChange,
  title,
  text,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  text: string
}) {
  return (
    <label className="dash-tl-switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="dash-tl-switch-body">
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
    </label>
  )
}
