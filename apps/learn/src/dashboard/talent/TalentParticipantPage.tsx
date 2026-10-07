import type { ResumeLink, StaffProfileResult, TalentParticipantHeader } from '@id/types'
import { useState } from 'react'
import { useApiFetch, useLoad } from '../api'
import { useApp } from '../app-context'
import { errorNotice } from '../shared'
import { useScrollToHash } from './NoteIndicators'
import { NotesSection } from './NotesSection'
import { openLinkInNewTab } from './openTab'
import { StaffProfileView } from './StaffProfileView'
import { SupportSection } from './SupportSection'
import './talent.css'

/**
 * #69 B and C, staff: one participant's profile, notes and support items.
 * Mounted at /lms/talent/:userId in a provider workspace only.
 */
export function TalentParticipantPage({
  providerId,
  userId,
}: {
  providerId: string
  userId: string
}) {
  const { href } = useApp()
  const apiFetch = useApiFetch()
  const base = `/learn/providers/${providerId}/participants/${userId}`
  const header = useLoad<TalentParticipantHeader>(base)
  // Loading the profile is what the access log records as a view. It carries no pay. It starts with
  // the header (the server checks access itself), so "loading" is true from the first render and
  // "has not started a profile" can only mean the request really finished with no profile.
  const profile = useLoad<StaffProfileResult>(`${base}/profile`)
  const [busy, setBusy] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const [resumeUrl, setResumeUrl] = useState<string | null>(null)

  async function openResume() {
    setBusy(true)
    setResumeError(null)
    setResumeUrl(null)
    try {
      // The tab opens inside the click, before the fetch, so popup blockers allow it.
      const { url, opened } = await openLinkInNewTab(
        async () => ((await (await apiFetch(`${base}/resume`)).json()) as ResumeLink).url
      )
      if (!opened) setResumeUrl(url)
    } catch (err) {
      setResumeError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useScrollToHash(!!header.data)
  if (header.error) return errorNotice(header.error)
  if (header.loading || !header.data) return <p className="dash-loading">Loading…</p>
  const h = header.data
  return (
    <>
      <p className="dash-back">
        <a href={href('/lms/talent')}>← Talent</a>
      </p>
      <h1 className="dash-h2">{h.name}</h1>
      <p className="dash-muted">
        {h.email ?? 'No email on file'}
        {h.cohorts.length > 0 && ` · ${h.cohorts.map((c) => c.cohortName).join(', ')}`}
      </p>
      {h.cohorts.length > 0 && (
        <p className="tl-records">
          Learner record:{' '}
          {h.cohorts.map((c, i) => (
            <span key={c.cohortId}>
              {i > 0 && ' · '}
              <a
                href={href(
                  `/lms/cohorts/${encodeURIComponent(c.cohortId)}/learners/${encodeURIComponent(userId)}`
                )}
              >
                {c.cohortName} →
              </a>
            </span>
          ))}
          <span className="dash-muted"> (attendance, activity and notes in that cohort)</span>
        </p>
      )}

      <section className="dash-card tl-card" aria-labelledby="tl-profile-h">
        <h2 id="tl-profile-h" className="dash-card-title">
          Talent profile
        </h2>
        {profile.error ? (
          errorNotice(profile.error)
        ) : profile.loading ? (
          <p className="dash-loading">Loading…</p>
        ) : (
          <StaffProfileView
            profile={profile.data}
            compensationPath={`${base}/compensation`}
            onOpenResume={openResume}
            resumeBusy={busy}
            resumeError={resumeError}
            resumeFallbackUrl={resumeUrl}
          />
        )}
      </section>

      <div id="notes" className="tl-anchor">
        <NotesSection providerId={providerId} userId={userId} cohorts={h.cohorts} />
      </div>
      <div id="follow-ups" className="tl-anchor">
        <SupportSection providerId={providerId} userId={userId} />
      </div>
    </>
  )
}
