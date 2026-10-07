import type { LearnerProfileState } from '@id/types'
import { useLoad } from '../api'
import { errorNotice } from '../shared'
import { TalentProfileForm } from './TalentProfileForm'
import './talent.css'

/** #69 C: the learner's one profile. Mounted at /lms/learning/profile. */
export function MyProfilePage() {
  const load = useLoad<LearnerProfileState>('/learn/me/profile')
  if (load.error) return errorNotice(load.error)
  if (load.loading || !load.data) return <p className="dash-loading">Loading…</p>
  return (
    <div className="tl-page">
      <header className="tl-head">
        <h1 className="dash-h2">My profile</h1>
        <p className="tl-lede">
          Tell us about your work and goals once. You choose who can see it.
        </p>
      </header>
      <TalentProfileForm state={load.data} />
    </div>
  )
}
