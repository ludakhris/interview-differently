import type { LearnerTalentProfileEntry } from '@id/types'
import { useLoad } from '../api'
import { errorNotice } from '../shared'
import { TalentProfileForm } from './TalentProfileForm'
import './talent.css'

/** #69 C: the learner's own talent profile, one per training provider. Mounted at /lms/learning/profile. */
export function MyProfilePage() {
  const load = useLoad<LearnerTalentProfileEntry[]>('/learn/me/talent-profiles')
  if (load.error) return errorNotice(load.error)
  if (load.loading || !load.data) return <p className="dash-loading">Loading…</p>
  const entries = load.data
  return (
    <>
      <h1 className="dash-h2">My profile</h1>
      <p className="tl-lede">
        This helps your training provider match you with job opportunities. Staff at your provider
        can see it. Employers see it only if you say yes in the last section. You can change
        anything, any time.
      </p>
      {entries.length === 0 ? (
        <p className="dash-muted">
          You are not in a program yet. Once you join one, your profile will appear here.
        </p>
      ) : (
        entries.map((entry) => (
          <section
            key={entry.providerId}
            className="dash-card tl-card"
            aria-labelledby={`tl-${entry.providerId}`}
          >
            <h2 id={`tl-${entry.providerId}`} className="dash-card-title">
              {entry.providerName}
            </h2>
            <p className="dash-muted">
              {entry.profile?.completedAt ? 'Complete' : entry.profile ? 'Started' : 'Not started'}
              {' · '}
              {entry.cohorts.map((c) => c.cohortName).join(', ')}
            </p>
            <TalentProfileForm entry={entry} mode="page" />
          </section>
        ))
      )}
    </>
  )
}
