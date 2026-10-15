import type { ContentLibrary, ContentReviewFilter, LibraryContent } from '@id/types'
import { useState } from 'react'
import { useApiSend, useLoad } from './api'
import { SYSTEM_ADMIN } from './AdminPages'
import { useApp } from './app-context'
import { Notice } from './DashboardShell'
import { dateShort } from './format'
import { errorNotice, useRole } from './shared'
import { WatchLessonLink } from './WatchLessonLink'
import {
  canApprove,
  canReject,
  capText,
  CONTENT_FILTERS,
  contentList,
  levelText,
  statusText,
  tokenText,
  usedByText,
} from './contentReview'
import './content-review.css'

/**
 * Admin toolbox: Content review (GitHub issue #90). A system admin approves AI-written practice and lessons for reuse
 * with other learners, or rejects them everywhere. The API answers system admins only.
 */
export function ContentReviewPage() {
  const role = useRole()
  const { href } = useApp()
  const [filter, setFilter] = useState<ContentReviewFilter>('needs-review')

  if (role !== SYSTEM_ADMIN)
    return (
      <Notice title="Your account does not have access">
        The admin tools are only open to platform administrators.
      </Notice>
    )

  return (
    <>
      <a className="dash-back" href={href('/lms/admin')}>
        ← Admin
      </a>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">Content review</h1>
          <p className="dash-sub">
            Practice and lessons written by AI for a learner. Approved content is reused for other
            learners. Rejected content is no longer shown, and its learners get new content.
          </p>
        </div>
      </div>
      <div className="cr-tabs" role="group" aria-label="Show">
        {CONTENT_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={f.value === filter ? 'cr-tab cr-tab-on' : 'cr-tab'}
            aria-pressed={f.value === filter}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {/* Keyed by tab, so a new tab starts loading empty instead of showing the last tab's rows with live buttons. */}
      <ContentList key={filter} filter={filter} />
    </>
  )
}

/** One tab's rows. After a decision it reloads in place, keeping the list on screen meanwhile. */
function ContentList({ filter }: { filter: ContentReviewFilter }) {
  const lib = useLoad<ContentLibrary>(`/learn/admin/content?filter=${filter}`)
  if (lib.error) return errorNotice(lib.error)
  if (!lib.data) return <p className="dash-loading">Loading content…</p>
  const rows = contentList(lib.data)
  if (rows.length === 0) return <p className="dash-muted">Nothing here.</p>
  const cap = capText(lib.data)
  return (
    <>
      {cap && <p className="dash-muted">{cap}</p>}
      <ul className="cr-list">
        {rows.map((c) => (
          <ContentCard key={`${c.kind}:${c.id}`} content={c} onDone={lib.reload} />
        ))}
      </ul>
    </>
  )
}

function ContentCard({ content: c, onDone }: { content: LibraryContent; onDone: () => void }) {
  const send = useApiSend()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function curate(approve: boolean) {
    // Rejecting takes the content from every learner who has it, so it asks once more.
    if (!approve && !confirming) return setConfirming(true)
    setConfirming(false)
    setBusy(true)
    setError(null)
    try {
      await send('POST', `/learn/admin/content/${c.kind}/${encodeURIComponent(c.id)}/curate`, {
        approve,
      })
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const tokens = tokenText(c.tokens)
  const partsLabel = c.kind === 'lesson' ? `${c.parts.length} scenes` : `${c.parts.length} requests`
  return (
    <li className="dash-card cr-card">
      <div className="cr-chips">
        <span className={c.kind === 'lesson' ? 'cr-chip cr-chip-lesson' : 'cr-chip'}>
          {c.kind === 'lesson' ? 'Lesson' : 'Practice'}
        </span>
        <span className="cr-chip cr-chip-skill">{c.skillLabel}</span>
        <span className={`cr-status cr-status-${c.reusable ? 'reusable' : c.status}`}>
          {statusText(c)}
        </span>
      </div>
      <p className="cr-title">{c.title}</p>
      <p className="dash-muted cr-meta">
        {[
          c.kind === 'practice' && c.bankSlug ? `Bank ${c.bankSlug}` : null,
          c.kind === 'lesson' ? levelText(c.level) : null,
          c.model,
          `prompt ${c.promptVersion}`,
          tokens ? `tokens ${tokens}` : null,
          `written ${dateShort(c.createdAt)}`,
          usedByText(c),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {c.reviewedBy && (
        <p className="dash-muted cr-meta">
          {c.status === 'rejected' ? 'Rejected' : 'Approved'} by {c.reviewedBy}
          {c.reviewedAt ? ` on ${dateShort(c.reviewedAt)}` : ''}
        </p>
      )}
      <details className="cr-parts">
        <summary>Show the {partsLabel}</summary>
        <ol>
          {c.parts.map((p, i) => (
            <li key={i}>
              {p.heading && <strong>{p.heading}. </strong>}
              {p.text}
            </li>
          ))}
        </ol>
      </details>
      {c.kind === 'lesson' && (
        <WatchLessonLink
          path={`/learn/admin/content/lesson/${encodeURIComponent(c.id)}/preview`}
          onError={setError}
        />
      )}
      {error && (
        <p className="dash-error" role="alert">
          {error}
        </p>
      )}
      {canReject(c) && (
        <p className="dash-muted cr-hint">
          Reject removes it from the library for everyone, and learners who were given it get new
          content.
        </p>
      )}
      {(canApprove(c) || canReject(c)) && (
        <div className="cr-actions">
          {canApprove(c) && !confirming && (
            <button
              type="button"
              className="dash-btn"
              disabled={busy}
              onClick={() => void curate(true)}
            >
              Approve for reuse
            </button>
          )}
          {canReject(c) && (
            <button
              type="button"
              className={confirming ? 'dash-btn dash-btn-warn' : 'dash-btn-secondary'}
              disabled={busy}
              onClick={() => void curate(false)}
            >
              {confirming ? 'Reject for every learner' : 'Reject'}
            </button>
          )}
          {confirming && (
            <button
              type="button"
              className="dash-btn-quiet"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </li>
  )
}
