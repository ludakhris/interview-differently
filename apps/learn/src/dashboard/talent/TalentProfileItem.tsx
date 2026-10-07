import type { LearnerItem, LearnerProfileState } from '@id/types'
import { useApiFetch, useLoad } from '../api'
import { errorNotice } from '../shared'
import { TalentProfileForm } from './TalentProfileForm'
import './talent.css'

/**
 * #69 C: the learner page for the course item 'profile'. The same form as My profile. Whether the
 * item is done is decided by the profile itself (complete, and fresh when a refresh period applies),
 * so after each save the item is read back.
 */
export function TalentProfileItem(props: {
  item: LearnerItem
  onChange: (i: LearnerItem) => void
  nextHref: string
  nextLabel: string
}) {
  const { item } = props
  const apiFetch = useApiFetch()
  const load = useLoad<LearnerProfileState>('/learn/me/profile')
  if (load.error) return errorNotice(load.error)
  if (load.loading || !load.data) return <p className="dash-loading">Loading…</p>

  async function saved() {
    try {
      const res = await apiFetch(`/learn/me/cohorts/${item.cohortId}/items/${item.id}`)
      props.onChange((await res.json()) as LearnerItem)
    } catch {
      /* the profile is saved; the page catches up on the next load */
    }
  }

  return (
    <article className="tl-page tl-itempage">
      {item.note && (
        <p className="dash-banner" data-testid="profile-note">
          {item.note}
        </p>
      )}
      <p className="tl-lede">Tell us about your work and goals once. You choose who can see it.</p>
      <TalentProfileForm state={load.data} onSaved={() => void saved()}>
        {item.status === 'completed' && (
          <span className="tl-next">
            <span className="dash-chip dash-chip-on">Done</span>{' '}
            <a className="dash-btn-secondary" href={props.nextHref}>
              {props.nextLabel}
            </a>
          </span>
        )}
      </TalentProfileForm>
    </article>
  )
}
