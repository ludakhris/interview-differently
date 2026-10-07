import type { LearnerItem } from '@id/types'
import './talent.css'

/**
 * #69 C: the learner page for a course item of type 'profile'. Mounted by LearningItemPage with the
 * same props the other item players get. Stub.
 */
export function TalentProfileItem(props: {
  item: LearnerItem
  onChange: (i: LearnerItem) => void
  nextHref: string
  nextLabel: string
}) {
  return (
    <p className="dash-muted tl-placeholder">
      The talent profile form for “{props.item.title}” will appear here.
    </p>
  )
}
