import type { CourseDetail } from '@id/types'
import { useState } from 'react'
import { useApiSend, useLoad } from './api'
import { StaffAttempts } from './AttemptsList'
import { submitLaunchForm } from './launchForm'
import { toolLabelable } from './toolKinds'
import type { AttemptLogEntry } from './attemptsText'

/** Staff: one learner's attempts at a connected-tool item of the cohort's course, fetched when opened. */
export function AttemptsPanel(props: { courseId: string; enrollmentId: string; name: string }) {
  const course = useLoad<CourseDetail>(`/learn/courses/${props.courseId}`)
  const tools = (course.data?.modules ?? [])
    .flatMap((m) => m.items)
    .filter((i) => i.type === 'tool')
  const send = useApiSend()
  const [picked, setPicked] = useState('')
  const [opening, setOpening] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const itemId = picked || (tools.length === 1 ? tools[0].id : '')
  const attempts = useLoad<{ attempts: AttemptLogEntry[]; attemptsBeforeLog?: number }>(
    itemId
      ? `/learn/enrollments/${props.enrollmentId}/attempts?itemId=${encodeURIComponent(itemId)}`
      : null
  )

  const item = tools.find((t) => t.id === itemId)
  const isAssessment = !!item && toolLabelable(String(item.config?.toolId ?? ''))
  const hasAttempts =
    (attempts.data?.attempts.length ?? 0) > 0 || (attempts.data?.attemptsBeforeLog ?? 0) > 0

  /** Opens this learner's answers in the Simulator, read-only, and brings staff back to the cohort. */
  async function viewAnswers() {
    setOpening(true)
    setLaunchError(null)
    try {
      const out = await send<{ action: string; fields: Record<string, string> }>(
        'POST',
        `/learn/enrollments/${props.enrollmentId}/review-launch`,
        { itemId }
      )
      submitLaunchForm(out.action, out.fields)
    } catch (err) {
      setLaunchError((err as Error).message)
      setOpening(false)
    }
  }

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
      {isAssessment && hasAttempts && (
        <>
          <button
            type="button"
            className="dash-btn-secondary"
            disabled={opening}
            onClick={() => void viewAnswers()}
          >
            {opening ? 'Opening…' : `View ${props.name}'s answers`}
          </button>
          {launchError && <p className="dash-error">{launchError}</p>}
        </>
      )}
    </div>
  )
}
