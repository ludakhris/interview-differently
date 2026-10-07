import { useEffect, useRef, useState, type FormEvent } from 'react'
import { looksHttps } from './toolsLogic'

/** Dynamic registration: paste the tool's link, open the platform-stamped version in a new tab. */
export function RegisterPanel({
  stage,
  blockedLink,
  busy,
  onStart,
  onClose,
  onShowInfo,
}: {
  stage: 'form' | 'waiting'
  /** The link to open by hand when the browser blocked the new tab. */
  blockedLink: string | null
  busy: boolean
  /** Resolves to an error message, or null once the registration page was opened or its link shown. */
  onStart: (initiationUrl: string) => Promise<string | null>
  onClose: () => void
  /** Opens the explanation of how registration works. */
  onShowInfo: () => void
}) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
    heading.current?.scrollIntoView?.({ block: 'start' })
  }, [stage])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!looksHttps(url)) return setError('The registration link must start with https://.')
    setError(null)
    const message = await onStart(url.trim())
    if (message) setError(message)
  }

  if (stage === 'waiting')
    return (
      <section className="dash-card dash-tl-panel" aria-labelledby="h-register">
        <h2 className="dash-card-title" id="h-register" tabIndex={-1} ref={heading}>
          Waiting for the tool
        </h2>
        <p role="status">
          Finish registering in the tool's tab. When you come back, this page refreshes and shows
          what was added.
        </p>
        {blockedLink && (
          <p>
            Your browser blocked the new tab.{' '}
            <a href={blockedLink} target="_blank" rel="noopener">
              Open the tool's registration page
            </a>
          </p>
        )}
        <div className="dash-tl-actions-btns">
          <button type="button" className="dash-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    )

  return (
    <section className="dash-card dash-tl-panel" aria-labelledby="h-register">
      <h2 className="dash-card-title" id="h-register" tabIndex={-1} ref={heading}>
        Register a tool from its link
      </h2>
      <form className="dash-tl-form" onSubmit={(e) => void submit(e)}>
        <p className="dash-muted dash-tl-help">
          Some tools can register themselves. Paste the registration link the tool gives you; we add
          the tool and its connection, switched off, for you to review.{' '}
          <button type="button" className="dash-linkbtn" onClick={onShowInfo}>
            How does this work?
          </button>
        </p>
        <label className="dash-field">
          <span>The tool's registration link</span>
          <input
            type="url"
            inputMode="url"
            required
            maxLength={1000}
            placeholder="https://tool.example/lti/register"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoCapitalize="none"
            autoFocus
            spellCheck={false}
          />
          <small className="dash-muted">
            It must be a public address that starts with https:// (no spaces).
          </small>
        </label>
        {error && (
          <p className="dash-error" role="alert">
            {error}
          </p>
        )}
        <div className="dash-tl-actions-btns">
          <button className="dash-btn" disabled={busy}>
            {busy ? 'Starting…' : 'Start registration'}
          </button>
          <button type="button" className="dash-btn-secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}
