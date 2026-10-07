import './attendance.css'
import type { LearnerAttendance } from '@id/types'
import { useLoad } from '../api'
import { learnerAttendanceLine } from './attendanceLogic'

/** One compact line for the learner's course page; nothing unless a session has been held. */
export function LearnerAttendanceLine({ cohortId }: { cohortId: string }) {
  const { data } = useLoad<LearnerAttendance>(`/learn/me/cohorts/${cohortId}/attendance`)
  const line = data ? learnerAttendanceLine(data) : null
  return line ? <p className="at-line">{line}</p> : null
}
