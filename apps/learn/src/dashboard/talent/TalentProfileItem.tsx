import type { LearnerItem, LearnerTalentProfileEntry } from '@id/types'
import { useApiFetch, useLoad } from '../api'
import { errorNotice } from '../shared'
import { TalentProfileForm } from './TalentProfileForm'
import './talent.css'

/**
 * #69 C: the learner page for a course item of type 'profile'. The same form as My profile; saving it
 * as finished completes the item (the server does that) and offers the way on.
 */
export function TalentProfileItem(props: {
  item: LearnerItem
  onChange: (i: LearnerItem) => void
  nextHref: string
  nextLabel: string
}) {
  const { item } = props
  const apiFetch = useApiFetch()
  const load = useLoad<LearnerTalentProfileEntry[]>('/learn/me/talent-profiles')
  if (load.error) return errorNotice(load.error)
  if (load.loading || !load.data) return <p className="dash-loading">Loading…</p>
  const entry = load.data.find((e) => e.cohorts.some((c) => c.cohortId === item.cohortId))
  if (!entry) return <p className="dash-muted">We could not find your program for this step.</p>

  // The server completes the item when the profile is finished; read it back so the page shows it.
  async function saved(completed: boolean) {
    if (!completed) return
    try {
      const res = await apiFetch(`/learn/me/cohorts/${item.cohortId}/items/${item.id}`)
      props.onChange((await res.json()) as LearnerItem)
    } catch {
      /* the profile is saved; the page catches up on the next load */
    }
  }

  return (
    <article className="dash-card tl-card">
      <p className="tl-lede">
        Tell us a little about your work and what you are looking for. This helps{' '}
        {entry.providerName} match you with job opportunities. It takes about five minutes, and you
        can come back to it.
      </p>
      <TalentProfileForm entry={entry} mode="item" onSaved={(_p, c) => void saved(c)} />
      {item.status === 'completed' && (
        <p className="tl-next">
          <span className="dash-chip dash-chip-on">Done</span>{' '}
          <a className="dash-btn" href={props.nextHref}>
            {props.nextLabel}
          </a>
        </p>
      )}
    </article>
  )
}
