import type { ResumeLink, TalentParticipantHeader, TalentProfileStaffView } from '@id/types'
import { useState } from 'react'
import { useApiFetch, useLoad } from '../api'
import { useApp } from '../app-context'
import { errorNotice } from '../shared'
import { NotesSection } from './NotesSection'
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
  // Loading the profile is what the access log records as a view. It carries no pay.
  const profile = useLoad<TalentProfileStaffView | null>(header.data ? `${base}/profile` : null)
  const [busy, setBusy] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)

  async function openResume() {
    setBusy(true)
    setResumeError(null)
    try {
      const link = (await (await apiFetch(`${base}/resume`)).json()) as ResumeLink
      window.open(link.url, '_blank', 'noopener')
    } catch (err) {
      setResumeError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

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
          />
        )}
      </section>

      <NotesSection providerId={providerId} userId={userId} />
      <SupportSection providerId={providerId} userId={userId} />
    </>
  )
}
