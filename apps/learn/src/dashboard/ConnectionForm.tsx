import type { LearnConnection } from '@id/types'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ID_PATTERN } from './toolsLogic'

export interface ConnectionBody {
  id: string
  name: string
  clientId: string
  deploymentId: string
  loginUrl: string
  launchUrl: string
  jwksUrl: string
}

export function ConnectionForm({
  editing,
  busy,
  onSave,
  onCancel,
}: {
  /** The connection being changed, or null for a new one. */
  editing: LearnConnection | null
  busy: boolean
  /** Resolves to an error message, or null when saved. */
  onSave: (body: ConnectionBody) => Promise<string | null>
  onCancel: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
    heading.current?.scrollIntoView?.({ block: 'start' })
  }, [])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const text = (k: string) => String(f.get(k) ?? '').trim()
    const id = editing ? editing.id : text('id')
    if (!editing && !ID_PATTERN.test(id))
      return setError('The connection id must be 2 to 40 lowercase letters, numbers or dashes.')
    setError(null)
    const message = await onSave({
      id,
      name: text('name'),
      clientId: text('clientId'),
      deploymentId: text('deploymentId'),
      loginUrl: text('loginUrl'),
      launchUrl: text('launchUrl'),
      jwksUrl: text('jwksUrl'),
    })
    if (message) setError(message)
  }

  return (
    <section className="dash-card dash-tl-panel" aria-labelledby="h-conn-form">
      <h2 className="dash-card-title" id="h-conn-form" tabIndex={-1} ref={heading}>
        {editing ? `Edit ${editing.name}` : 'Add a connection'}
      </h2>
      <form className="dash-tl-form" onSubmit={(e) => void submit(e)}>
        <section className="dash-tl-section" aria-labelledby="cf-basics">
          <h3 id="cf-basics">Basics</h3>
          <div className="dash-field-row">
            {!editing && (
              <label className="dash-field">
                <span>Connection id</span>
                <input
                  name="id"
                  required
                  maxLength={40}
                  placeholder="acme"
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
              <input name="name" required maxLength={80} defaultValue={editing?.name} />
              <small className="dash-muted">Usually the vendor's name.</small>
            </label>
          </div>
        </section>

        <section className="dash-tl-section" aria-labelledby="cf-reg">
          <h3 id="cf-reg">Registration</h3>
          <p className="dash-muted dash-tl-help">
            The values the vendor gave you when you registered this platform with them.
          </p>
          <div className="dash-field-row">
            <label className="dash-field">
              <span>Client id</span>
              <input name="clientId" required maxLength={200} defaultValue={editing?.clientId} />
            </label>
            <label className="dash-field">
              <span>Deployment id</span>
              <input
                name="deploymentId"
                required
                maxLength={200}
                defaultValue={editing?.deploymentId ?? '1'}
              />
            </label>
          </div>
        </section>

        <section className="dash-tl-section" aria-labelledby="cf-end">
          <h3 id="cf-end">Endpoints</h3>
          <p className="dash-muted dash-tl-help">
            Each must be a public address starting with https://.
          </p>
          <label className="dash-field">
            <span>Login URL</span>
            <input
              name="loginUrl"
              type="url"
              required
              maxLength={500}
              defaultValue={editing?.loginUrl}
            />
            <small className="dash-muted">The tool's OIDC login initiation URL.</small>
          </label>
          <label className="dash-field">
            <span>Launch URL</span>
            <input
              name="launchUrl"
              type="url"
              required
              maxLength={500}
              defaultValue={editing?.launchUrl}
            />
            <small className="dash-muted">Where the learner lands once login is done.</small>
          </label>
          <label className="dash-field">
            <span>Key set URL</span>
            <input
              name="jwksUrl"
              type="url"
              required
              maxLength={500}
              defaultValue={editing?.jwksUrl}
            />
            <small className="dash-muted">
              Where the tool publishes its public keys. No secret is stored here; keys are fetched
              from this address.
            </small>
          </label>
        </section>

        <div className="dash-tl-actions">
          {error && (
            <p className="dash-error dash-tl-actions-msg" role="alert">
              {error}
            </p>
          )}
          <div className="dash-tl-actions-btns">
            <button className="dash-btn" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add connection'}
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
