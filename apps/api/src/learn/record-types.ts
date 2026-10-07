// GENERATED COPY of packages/types/src/record.ts. Do not edit here.
// Edit the original, then run: npm run sync:types --workspace @id/api
// (The API build has no access to packages/, so it carries its own copy.)

// A staff member's view of one learner in one cohort (the "learner record" page).
//
// GET /learn/cohorts/:cohortId/learners/:userId/record?tz&from&to
// Guard: the cohort roster guard (agency admin, provider admin or system admin who may open the
// cohort's workspace); 404 unless the person is enrolled in that cohort. Participant notes and
// support items are staff-only data of the cohort's PROVIDER: they are included only when the
// caller is staff of that provider and is not the learner themselves. Otherwise `participant`
// and `support` are null and `restricted` is true (never an error). No compensation or profile
// content is ever part of this response.

import type { AttendanceStatus, SessionSkip } from './attendance-types'
import type { LearnerActivityReport } from './activity-types'
import type { ParticipantNoteDto, ProfileVisibility, SupportItemDto } from './talent-types'

export interface LearnerRecordMark {
  sessionId: string
  title: string
  /** ISO time. */
  startsAt: string
  /** Null when the session does not count for this learner (see `skipped`). */
  status: AttendanceStatus | null
  skipped: SessionSkip | null
  /** The staff note written with the mark, or null. */
  note: string | null
}

export interface LearnerRecordAttendanceNote {
  sessionId: string
  sessionTitle: string
  /** The cohort the note is about (always this cohort). */
  cohortName: string
  startsAt: string
  note: string
  /** Name of the staff member who took the register. */
  markedBy: string
  markedAt: string
}

export interface LearnerRecord {
  header: {
    userId: string
    name: string
    email: string | null
    status: 'enrolled' | 'completed' | 'withdrawn'
    /** ISO time. */
    joinedAt: string
    courseTitle: string
    cohortName: string
    /** The cohort's provider: where a note is written. */
    providerId: string
    progress: { itemsDone: number; itemsTotal: number }
    /** The learner's own readiness line: best interview score against the course goal. */
    readiness: { goal: number; interviewBest: number | null; interviewReady: boolean }
    /**
     * Whether a profile exists, is complete and is fresh; never its content. Null for staff who
     * are not staff of the provider (the profile is not theirs to see).
     */
    profile: { status: ProfileVisibility; complete: boolean | null; fresh: boolean | null } | null
  }
  attendance: {
    /** Percent, null when no session counts yet. */
    ratePct: number | null
    sessionsCounted: number
    /** Every session that has started, newest first. */
    marks: LearnerRecordMark[]
  }
  /** The learner's day-by-day report for the requested range (default last 30 days). */
  activity: LearnerActivityReport
  notes: {
    /** Attendance notes need only cohort staff. */
    attendance: LearnerRecordAttendanceNote[]
    /** Null when `restricted`. Newest first. */
    participant: ParticipantNoteDto[] | null
    /** Names of the cohorts the participant notes are about, by cohort id (empty when `restricted`). */
    cohortNames: Record<string, string>
    /** Null when `restricted`. */
    support: SupportItemDto[] | null
    /** True when the caller may not read participant notes and support items. */
    restricted: boolean
  }
}
