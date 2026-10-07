import type { CourseDetail } from '@id/types'
import { useState } from 'react'
import { useLoad } from './api'
import { StaffAttempts } from './AttemptsList'
import type { AttemptLogEntry } from './attemptsText'

/** Staff: one learner's attempts at a connected-tool item of the cohort's course, fetched when opened. */
export function AttemptsPanel(props: { courseId: string; enrollmentId: string; name: string }) {
  const course = useLoad<CourseDetail>(`/learn/courses/${props.courseId}`)
  const tools = (course.data?.modules ?? [])
    .flatMap((m) => m.items)
    .filter((i) => i.type === 'tool')
  const [picked, setPicked] = useState('')
  const itemId = picked || (tools.length === 1 ? tools[0].id : '')
  const attempts = useLoad<{ attempts: AttemptLogEntry[]; attemptsBeforeLog?: number }>(
    itemId
      ? `/learn/enrollments/${props.enrollmentId}/attempts?itemId=${encodeURIComponent(itemId)}`
      : null
  )

  if (course.loading) return <p className="dash-loading">Loading attempts…</p>
  if (course.error) {
    return (
      <div role="alert">
        <p className="dash-error">Could not load the course items: {course.error.message}</p>
        <button type="button" className="dash-btn-quiet" onClick={course.reload}>
          Try again
        </button>
      </div>
    )
  }
  if (tools.length === 0) {
    return <p className="dash-muted">This course has no connected-tool items.</p>
  }
  return (
    <div className="dash-attempts-panel">
      {tools.length > 1 && (
        <label className="dash-field">
          <span>Attempts of {props.name} at</span>
          <select value={picked} onChange={(e) => setPicked(e.target.value)}>
            <option value="">Choose an item…</option>
            {tools.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {itemId && (
        <StaffAttempts
          state={{ loading: attempts.loading, error: attempts.error, data: attempts.data }}
          onRetry={attempts.reload}
        />
      )}
    </div>
  )
}
