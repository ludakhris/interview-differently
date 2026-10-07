import type { ProfileDto, ResumeInfo, ResumeLink } from '@id/types'
import { useRef, useState } from 'react'
import { useApiFetch, useApiSend } from '../api'
import { dateShort } from '../format'
import { openLinkInNewTab } from './openTab'
import { fileSize, resumeProblem } from './profileForm'
import './notes.css'
import './talent.css'

/** The learner's resume: upload, replace, open and remove. The file is private to the learner and the organizations they share with. */
export function ResumeBox(props: { resume: ResumeInfo | null; onChange: (p: ProfileDto) => void }) {
  const apiFetch = useApiFetch()
  const send = useApiSend()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null)
  const removeBtn = useRef<HTMLButtonElement>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const base = '/learn/me/profile/resume'

  async function run(task: () => Promise<string>) {
    setBusy(true)
    setMessage(null)
    setBlockedUrl(null)
    try {
      setMessage({ kind: 'ok', text: await task() })
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  function choose(file: File | undefined) {
    if (!file) return
    const problem = resumeProblem(file)
    if (problem) {
      setMessage({ kind: 'error', text: problem })
      return
    }
    void run(async () => {
      const body = new FormData()
      body.append('file', file)
      const res = await apiFetch(base, { method: 'POST', body })
      props.onChange((await res.json()) as ProfileDto)
      return 'Resume saved.'
    })
    if (input.current) input.current.value = ''
  }

  // The tab is opened inside the click (before the fetch) so popup blockers allow it.
  const open = () =>
    run(async () => {
      const { url, opened } = await openLinkInNewTab(
        async () => ((await (await apiFetch(base)).json()) as ResumeLink).url
      )
      if (opened) return 'Your resume is downloading. The link works for 5 minutes.'
      setBlockedUrl(url)
      return 'Your browser blocked the new tab. Use the link below.'
    })

  const remove = () =>
    run(async () => {
      props.onChange(await send<ProfileDto>('DELETE', base))
      setConfirming(false)
      // The Remove button is gone now; the upload control is the next sensible place.
      setTimeout(() => input.current?.focus(), 0)
      return 'Resume removed.'
    })

  function keepResume() {
    setConfirming(false)
    // The Remove button is back after the next render; put focus on it.
    setTimeout(() => removeBtn.current?.focus(), 0)
  }

  return (
    <div className="tl-resume">
      {props.resume ? (
        <p className="tl-resume-file">
          <strong>{props.resume.name}</strong>{' '}
          <span className="dash-muted">
            {fileSize(props.resume.size)}, added {dateShort(props.resume.uploadedAt)}
          </span>
        </p>
      ) : (
        <p className="dash-muted">No resume yet.</p>
      )}
      <div className="tl-actions">
        <label
          className={
            busy ? 'dash-btn-quiet dash-file dash-file-disabled' : 'dash-btn-quiet dash-file'
          }
        >
          {props.resume ? 'Replace resume' : 'Upload resume'}
          <input
            ref={input}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="tl-file-input"
            disabled={busy}
            onChange={(e) => choose(e.target.files?.[0])}
          />
        </label>
        {props.resume && (
          <>
            <button type="button" className="dash-btn-quiet" onClick={open} disabled={busy}>
              Download resume
            </button>
            {!confirming && (
              <button
                ref={removeBtn}
                type="button"
                className="dash-btn-quiet"
                onClick={() => setConfirming(true)}
                disabled={busy}
              >
                Remove
              </button>
            )}
          </>
        )}
      </div>
      {confirming && (
        <div
          className="nt-confirm"
          role="group"
          aria-label="Remove your resume?"
          aria-describedby="tl-remove-desc"
        >
          <span id="tl-remove-desc">Remove your resume? This cannot be undone.</span>
          <button type="button" className="dash-btn" disabled={busy} onClick={remove}>
            Yes, remove it
          </button>
          <button type="button" className="dash-btn-quiet" onClick={keepResume} autoFocus>
            Keep it
          </button>
        </div>
      )}
      {blockedUrl && (
        <p>
          <a href={blockedUrl} target="_blank" rel="noopener noreferrer">
            Download {props.resume?.name ?? 'your resume'}
          </a>
        </p>
      )}
      <p className="dash-hint">PDF, DOC or DOCX, up to 5 MB.</p>
      <p
        className={message?.kind === 'error' ? 'dash-error' : 'dash-muted'}
        role={message?.kind === 'error' ? 'alert' : 'status'}
      >
        {busy ? 'Working…' : (message?.text ?? '')}
      </p>
    </div>
  )
}
