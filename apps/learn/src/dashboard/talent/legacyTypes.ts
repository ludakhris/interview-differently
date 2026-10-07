// TEMPORARY, for the UI phase to delete: the per-provider profile shapes these pages were built
// against. The API now serves ONE profile per person (see ProfileDto, LearnerProfileState and
// StaffProfileResult in @id/types and docs/talent-and-attendance-design.md), so these pages will not
// work against it until they are rewritten. Kept only so the app still type-checks meanwhile.
import type { EducationLevel, ResumeInfo } from '@id/types'

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
