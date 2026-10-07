import type { ResumeInfo, ResumeLink, TalentProfileDto } from '@id/types'
import { useRef, useState } from 'react'
import { useApiFetch, useApiSend } from '../api'
import { dateShort } from '../format'
import { fileSize, resumeProblem } from './profileForm'
import './talent.css'

/** The learner's resume: upload, replace, open and remove. The file is private to the learner and their provider's staff. */
export function ResumeBox(props: {
  providerId: string
  resume: ResumeInfo | null
  onChange: (p: TalentProfileDto) => void
}) {
  const apiFetch = useApiFetch()
  const send = useApiSend()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const base = `/learn/me/talent-profiles/${props.providerId}/resume`

  async function run(task: () => Promise<string>) {
    setBusy(true)
    setMessage(null)
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
      props.onChange((await res.json()) as TalentProfileDto)
      return 'Resume saved.'
    })
    if (input.current) input.current.value = ''
  }

  const open = () =>
    run(async () => {
      const link = (await (await apiFetch(base)).json()) as ResumeLink
      window.open(link.url, '_blank', 'noopener')
      return 'Opened in a new tab. The link works for 5 minutes.'
    })

  const remove = () =>
    run(async () => {
      props.onChange(await send<TalentProfileDto>('DELETE', base))
      return 'Resume removed.'
    })

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
              Open resume
            </button>
            <button type="button" className="dash-btn-quiet" onClick={remove} disabled={busy}>
              Remove
            </button>
          </>
        )}
      </div>
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
