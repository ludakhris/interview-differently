// GENERATED COPY of packages/types/src/talent.ts. Do not edit here.
// Edit the original, then run: npm run sync:types --workspace @id/api
// (The API build has no access to packages/, so it carries its own copy.)

// #69 parts B and C: staff notes and support items (staff-only) and the talent profile (the learner's own).
//
// SCOPE: all of this belongs to (providerId, userId), where providerId is the course's provider
// (Course.providerId) of the cohort the person is in. It follows the participant across that
// provider's cohorts and never crosses providers. See docs/talent-and-attendance-design.md for who
// may read what. Nothing in the "staff" section below may ever be returned by a learner endpoint.

// ── Audit log ───────────────────────────────────────────────────────────────

export type DataAccessResource =
  | 'note'
  | 'support_item'
  | 'compensation'
  | 'resume'
  | 'talent_profile'
export type DataAccessAction =
  | 'read'
  | 'list'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'download'

/** One audited access. Holds no note text, compensation value or file content. */
export interface DataAccessLogRow {
  id: string
  actorId: string
  actorName: string
  providerId: string
  /** The participant concerned; null for a bulk read or export. */
  subjectUserId: string | null
  subjectName: string | null
  resource: DataAccessResource
  action: DataAccessAction
  /** Short non-sensitive context such as "csv, 42 rows". */
  detail: string | null
  createdAt: string
}

/** GET /learn/data-access-log?providerId&subjectUserId&actorId&resource&limit&before */
export interface DataAccessLogPage {
  rows: DataAccessLogRow[]
  /** Pass as `before` for the next page; null when there are no more. */
  nextBefore: string | null
}

// ── Participants (staff) ────────────────────────────────────────────────────

export interface TalentParticipantCohort {
  cohortId: string
  cohortName: string
  courseTitle: string
  enrollmentStatus: 'enrolled' | 'completed' | 'withdrawn'
}

/** Compensation is never in a list row. */
export interface TalentParticipantRow {
  userId: string
  name: string
  email: string | null
  cohorts: TalentParticipantCohort[]
  /** Null when the learner has not started a profile. */
  profile: {
    completed: boolean
    hasResume: boolean
    educationLevel: string | null
    yearsExperience: number | null
    industries: string[]
    targetRoles: string[]
    availableFrom: string | null
    shareWithEmployers: boolean
  } | null
  openSupportItems: number
  noteCount: number
}

/** GET /learn/providers/:providerId/participants/:userId */
export interface TalentParticipantHeader {
  userId: string
  name: string
  email: string | null
  cohorts: TalentParticipantCohort[]
}

// ── Notes (staff only) ──────────────────────────────────────────────────────

export interface ParticipantNoteDto {
  id: string
  providerId: string
  userId: string
  cohortId: string | null
  authorId: string
  authorName: string
  body: string
  createdAt: string
  updatedAt: string
}

export interface NoteInput {
  /** 1-4000 characters. */
  body: string
  /** The cohort the staff member was in when writing it; must be one of the provider's cohorts. */
  cohortId?: string | null
}

// ── Support items (staff only) ──────────────────────────────────────────────

export type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'cancelled'
export type SupportCategory =
  | 'transportation'
  | 'childcare'
  | 'housing'
  | 'technology'
  | 'financial'
  | 'health'
  | 'other'

export interface SupportItemDto {
  id: string
  providerId: string
  userId: string
  cohortId: string | null
  title: string
  category: SupportCategory
  details: string | null
  status: SupportStatus
  /** YYYY-MM-DD. */
  dueDate: string | null
  assigneeId: string | null
  assigneeName: string | null
  createdById: string
  createdByName: string
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

/** A support item in the provider-wide follow-up queue. */
export interface SupportQueueRow extends SupportItemDto {
  participantName: string
}

export interface SupportItemInput {
  title: string
  category?: SupportCategory
  details?: string | null
  status?: SupportStatus
  /** YYYY-MM-DD or null. */
  dueDate?: string | null
  /** Must be staff of the same provider; null clears it. */
  assigneeId?: string | null
  cohortId?: string | null
}

// ── Talent profile (the learner's own data) ─────────────────────────────────

export type EducationLevel =
  | 'high_school'
  | 'some_college'
  | 'associate'
  | 'bachelor'
  | 'master'
  | 'doctorate'
  | 'other'

export interface ResumeInfo {
  name: string
  size: number
  uploadedAt: string
}

/** The learner's profile as the learner sees and edits it. */
export interface TalentProfileDto {
  providerId: string
  resume: ResumeInfo | null
  educationLevel: EducationLevel | null
  fieldOfStudy: string | null
  school: string | null
  graduationYear: number | null
  yearsExperience: number | null
  industries: string[]
  /** Annual, whole dollars. */
  previousCompensation: number | null
  targetCompensation: number | null
  targetRoles: string[]
  /** YYYY-MM-DD. */
  availableFrom: string | null
  /** Consent to share this profile with employers. Off until the learner turns it on. */
  shareWithEmployers: boolean
  completedAt: string | null
  updatedAt: string
}

/** PUT /learn/me/talent-profiles/:providerId. Every field is optional; a missing field is left as is. */
export interface TalentProfileInput {
  educationLevel?: EducationLevel | null
  fieldOfStudy?: string | null
  school?: string | null
  graduationYear?: number | null
  yearsExperience?: number | null
  industries?: string[]
  previousCompensation?: number | null
  targetCompensation?: number | null
  targetRoles?: string[]
  availableFrom?: string | null
  shareWithEmployers?: boolean
  /** True marks the profile complete (the server checks the required fields). */
  complete?: boolean
}

/** One provider the learner is enrolled with, and their profile for it (null until started). */
export interface LearnerTalentProfileEntry {
  providerId: string
  providerName: string
  /** The learner's cohorts with this provider, so a profile item can find its entry by cohort. */
  cohorts: { cohortId: string; cohortName: string }[]
  profile: TalentProfileDto | null
}

/** What staff see on opening a profile: no pay, only whether any was given. Read-only for staff. */
export interface TalentProfileStaffView extends Omit<
  TalentProfileDto,
  'previousCompensation' | 'targetCompensation'
> {
  userId: string
  hasCompensation: boolean
}

/** GET .../participants/:userId/compensation. Fetched only on an explicit reveal, and audited. */
export interface TalentCompensation {
  previousCompensation: number | null
  targetCompensation: number | null
}

/** Short-lived link to download a resume. */
export interface ResumeLink {
  url: string
  name: string
  expiresInSeconds: number
}
