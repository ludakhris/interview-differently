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

/**
 * Why a held session does not count for a learner: no marks have been recorded for it yet
 * ('not_taken'), or the learner enrolled after it started ('before_join').
 */
export type SessionSkip = 'not_taken' | 'before_join'

/**
 * Rate rule (summary, CSV and the learner's own line). A session counts for a learner only if it has
 * started, at least one learner has a mark for it (the register was taken), and the learner enrolled
 * before it started. Within a counted session a learner with no mark is absent, and excused ones
 * leave the denominator: rate = (present + late) / (counted sessions - excused).
 */
export interface AttendanceSummaryRow {
  userId: string
  name: string
  present: number
  absent: number
  late: number
  excused: number
  /** Sessions that count for this learner, excused ones left out: the denominator of the rate. */
  sessions: number
  /** Sessions held so far in the cohort (started), counted or not. */
  sessionsHeld: number
  /** (present + late) / counted sessions, whole percent; null when no counted session. */
  ratePct: number | null
  /** Status by session id for the sessions that count, for the grid. A learner with no mark in a taken session is absent. */
  marks: Record<string, AttendanceStatus>
  /** Held sessions that do not count for this learner, by session id. */
  skipped: Record<string, SessionSkip>
}

/** GET /learn/cohorts/:cohortId/attendance. The CSV at .../attendance.csv has the same columns. */
export interface AttendanceSummary {
  cohortId: string
  sessions: number
  /** The sessions held so far, oldest first: the columns of the sessions grid. */
  sessionList: { id: string; title: string; startsAt: string; taken: boolean }[]
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
    /** The mark for a counted session (absent when the register was taken and there is no mark); null otherwise. */
    status: AttendanceStatus | null
    /** Set for a session that has started but does not count for this learner. */
    skipped: SessionSkip | null
  }[]
  /** Over the sessions that count; `unmarked` is always 0 (an unmarked learner in a taken session is absent). */
  counts: AttendanceCounts
  /** Sessions that count, excused ones left out: the denominator of the rate. */
  sessionsCounted: number
  ratePct: number | null
}
