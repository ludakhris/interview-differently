// #69 parts B and C: staff notes and support items (staff-only) and the talent profile (the learner's own).
//
// SCOPE: notes and support items belong to (providerId, userId), where providerId is the course's
// provider (Course.providerId) of the cohort the person is in; they never cross providers. The
// talent PROFILE belongs to the person alone (one per user); the learner chooses which
// organizations may see it (ProfileShare). See docs/talent-and-attendance-design.md for who may read
// what. Nothing in the "staff" section below may ever be returned by a learner endpoint.

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

/** Whether this provider may read the person's profile: the learner shared it with the provider. */
export type ProfileVisibility = 'shared' | 'not_shared' | 'none'

/** Compensation is never in a list row. */
export interface TalentParticipantRow {
  userId: string
  name: string
  email: string | null
  cohorts: TalentParticipantCohort[]
  /** 'none' = the learner has no profile yet. */
  profileStatus: ProfileVisibility
  /** Whether the profile meets the rule. Visible to staff even when not shared; null when 'none'. */
  complete: boolean | null
  /** Within the refresh period of this provider's requiring cohorts; null when none applies. */
  fresh: boolean | null
  /** The profile's content. Null unless `profileStatus` is 'shared'. */
  profile: {
    hasResume: boolean
    /** Every education level the person listed. */
    educationLevels: string[]
    yearsExperience: number | null
    industries: string[]
    targetRoles: string[]
    availableFrom: string | null
    /** The learner also lets this organization pass the profile to employers. */
    allowEmployers: boolean
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

// ── Talent profile (the learner's own data, one per person) ─────────────────

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

/** One school or program. A person can list several. */
export interface EducationEntry {
  level: EducationLevel
  fieldOfStudy: string | null
  school: string | null
  graduationYear: number | null
}

/** The learner's profile as the learner sees and edits it. Not tied to any provider. */
export interface ProfileDto {
  /** In the order the learner entered them. */
  educations: EducationEntry[]
  yearsExperience: number | null
  industries: string[]
  targetRoles: string[]
  /** YYYY-MM-DD. */
  availableFrom: string | null
  /** Annual, whole dollars. */
  previousCompensation: number | null
  targetCompensation: number | null
  resume: ResumeInfo | null
  /**
   * COMPUTED, never sent: at least one education entry, years of experience, and at least one
   * industry or target role.
   */
  complete: boolean
  /** When the profile first became complete; kept after that. */
  completedAt: string | null
  /** Last save; null when nothing has been saved yet. */
  updatedAt: string | null
}

/** An organization the learner can choose to show the profile to. */
export interface ShareOption {
  institutionId: string
  name: string
  kind: 'provider' | 'organization'
  /** Why it is on the list. A provider that is also the host reads 'your program'. */
  why: 'your program' | 'your cohort host'
  /** A cohort of the learner's that this organization runs requires the profile. */
  required: boolean
  /** The learner currently lets this organization see the profile. */
  shared: boolean
  /** ...and pass it on to employers. Only meaningful when `shared`. */
  allowEmployers: boolean
}

/** A cohort of the learner's that requires the profile (and maybe a periodic refresh). */
export interface ProfileRequirement {
  cohortId: string
  cohortName: string
  /** The program's provider. */
  providerName: string
  /** Null = the profile never goes stale. */
  refreshMonths: number | null
  /** Complete and, when a refresh period applies, saved within it. */
  satisfied: boolean
  /** ISO time the profile goes stale; null when it never does or nothing is saved. */
  dueBy: string | null
}

/** GET /learn/me/profile. `profile` is always present (empty values until the first save). */
export interface LearnerProfileState {
  profile: ProfileDto
  organizations: ShareOption[]
  requirements: ProfileRequirement[]
}

/**
 * PUT /learn/me/profile. A full replacement of the editable fields: educations and shares are the
 * complete lists wanted. There is no complete flag; completeness is computed.
 */
export interface ProfileInput {
  yearsExperience: number | null
  industries: string[]
  targetRoles: string[]
  availableFrom: string | null
  previousCompensation: number | null
  targetCompensation: number | null
  /** At most 8. */
  educations: {
    level: EducationLevel
    fieldOfStudy?: string | null
    school?: string | null
    graduationYear?: number | null
  }[]
  /** The organizations to show the profile to; only ids from `organizations`. One left out is not shared. */
  shares: { institutionId: string; allowEmployers: boolean }[]
}

/** What staff see of a profile the learner shared with their provider: no pay, only whether any was given. */
export interface TalentProfileStaffView {
  shared: true
  status: 'shared'
  userId: string
  educations: EducationEntry[]
  yearsExperience: number | null
  industries: string[]
  targetRoles: string[]
  availableFrom: string | null
  resume: ResumeInfo | null
  hasCompensation: boolean
  allowEmployers: boolean
  complete: boolean
  fresh: boolean | null
  completedAt: string | null
  updatedAt: string | null
}

/** What staff get when the profile is not shared with their provider: status only, never content. */
export interface TalentProfileUnshared {
  shared: false
  status: 'not_shared' | 'none'
  userId: string
  /** Null when there is no profile ('none'). */
  complete: boolean | null
  fresh: boolean | null
}

/** GET .../participants/:userId/profile. */
export type StaffProfileResult = TalentProfileStaffView | TalentProfileUnshared

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
