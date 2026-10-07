// #69 part D: sessions and attendance for live and hybrid cohorts.
// Staff endpoints use the same guard as the cohort roster (agency admin, provider admin, system admin
// who may open the cohort's workspace). A learner reads only their own marks.

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

export interface AttendanceCounts {
  present: number
  absent: number
  late: number
  excused: number
  /** Roster learners with no mark yet. */
  unmarked: number
}

export interface CohortSessionDto {
  id: string
  cohortId: string
  title: string
  /** ISO time. */
  startsAt: string
  endsAt: string | null
  location: string | null
  counts: AttendanceCounts
}

/** POST/PUT /learn/cohorts/:cohortId/sessions[/:sessionId] */
export interface SessionInput {
  title: string
  startsAt: string
  endsAt?: string | null
  location?: string | null
}

export interface AttendanceSheetRow {
  userId: string
  enrollmentId: string
  name: string
  email: string | null
  /** Null when not marked yet. */
  status: AttendanceStatus | null
  note: string | null
  markedAt: string | null
}

/** GET /learn/cohorts/:cohortId/sessions/:sessionId/marks. Rows are the active roster, plus anyone already marked. */
export interface AttendanceSheet {
  session: CohortSessionDto
  rows: AttendanceSheetRow[]
}

/** PUT /learn/cohorts/:cohortId/sessions/:sessionId/marks: a whole-cohort save in one call. */
export interface MarkInput {
  marks: { userId: string; status: AttendanceStatus; note?: string | null }[]
}

export interface AttendanceSummaryRow {
  userId: string
  name: string
  present: number
  absent: number
  late: number
  excused: number
  /** Sessions held so far that count (excused sessions are left out of the rate). */
  sessions: number
  /** (present + late) / counted sessions, whole percent; null when no counted session. */
  ratePct: number | null
}

/** GET /learn/cohorts/:cohortId/attendance. The CSV at .../attendance.csv has the same columns. */
export interface AttendanceSummary {
  cohortId: string
  sessions: number
  rows: AttendanceSummaryRow[]
}

/** GET /learn/me/cohorts/:cohortId/attendance. The staff note on a mark is never included. */
export interface LearnerAttendance {
  cohortId: string
  sessions: {
    id: string
    title: string
    startsAt: string
    location: string | null
    status: AttendanceStatus | null
  }[]
  counts: AttendanceCounts
  ratePct: number | null
}
