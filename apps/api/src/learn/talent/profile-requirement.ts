import type { PrismaService } from '../../prisma/prisma.service'

/** The id of the synthetic "Your profile" item a requiring cohort puts first in the outline. */
export const PROFILE_ITEM_ID = 'profile'
export const PROFILE_ITEM_TITLE = 'Your profile'
export const REFRESH_MIN_MONTHS = 1
export const REFRESH_MAX_MONTHS = 60

/** What the profile rule needs, from the fields alone: education, years, an industry, a target job and a resume. Nothing is ever "marked" complete. */
export function isProfileComplete(p: {
  educationCount: number
  yearsExperience: number | null
  industries: string[]
  targetRoles: string[]
  hasResume: boolean
}): boolean {
  return (
    p.hasResume &&
    p.educationCount > 0 &&
    p.yearsExperience !== null &&
    p.industries.length > 0 &&
    p.targetRoles.length > 0
  )
}

/** The stored facts completion and requirements need; null in `ProfileFacts` position means no profile. */
export interface ProfileFacts {
  complete: boolean
  completedAt: Date | null
  /** Last save. A save is also how a learner confirms the profile is still current. */
  updatedAt: Date
}

/** Adds calendar months in UTC (31 Jan + 1 month is 28/29 Feb, not March). */
export function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime())
  const day = out.getUTCDate()
  out.setUTCDate(1)
  out.setUTCMonth(out.getUTCMonth() + months)
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate()
  out.setUTCDate(Math.min(day, last))
  return out
}

/** When a profile saved at `updatedAt` goes stale; null when there is no refresh period. */
export function dueByOf(updatedAt: Date | null, months: number | null): Date | null {
  return updatedAt && months ? addMonths(updatedAt, months) : null
}

/** Still within the refresh period (true when there is none). */
export function isFresh(updatedAt: Date, months: number | null, now: Date): boolean {
  const due = dueByOf(updatedAt, months)
  return due === null || due.getTime() > now.getTime()
}

export type ProfileRequirementState = 'missing' | 'incomplete' | 'needs_refresh' | 'done'

/** The profile against a rule: complete, and saved within `months` when a period applies. */
export function requirementState(
  facts: ProfileFacts | null,
  months: number | null,
  now: Date
): ProfileRequirementState {
  if (!facts) return 'missing'
  if (!facts.complete) return 'incomplete'
  return isFresh(facts.updatedAt, months, now) ? 'done' : 'needs_refresh'
}

export const isSatisfied = (
  facts: ProfileFacts | null,
  months: number | null,
  now: Date
): boolean => requirementState(facts, months, now) === 'done'

export const stateNote = (s: ProfileRequirementState): string | null =>
  s === 'needs_refresh'
    ? 'Time to refresh your profile'
    : s === 'incomplete'
      ? 'Finish your profile'
      : null

/** The rule a cohort sets: `months` is only meaningful when the profile is required. */
export interface CohortProfileRule {
  requiresProfile: boolean
  profileRefreshMonths: number | null
}

export const refreshMonthsOf = (c: Partial<CohortProfileRule> | null | undefined): number | null =>
  c?.requiresProfile ? (c.profileRefreshMonths ?? null) : null

/**
 * Which item is "Your profile" for a cohort. A requiring cohort uses the course's own first
 * `profile` item when it has one (moved to the front), else the synthetic one.
 */
export function profileLead(
  courseProfileItemIds: string[],
  requires: boolean
): { leadId: string; synthetic: boolean } | null {
  if (!requires) return null
  return courseProfileItemIds.length > 0
    ? { leadId: courseProfileItemIds[0], synthetic: false }
    : { leadId: PROFILE_ITEM_ID, synthetic: true }
}

/** Loads the facts for one user, or null when they have no profile. */
export async function loadProfileFacts(
  prisma: PrismaService,
  userId: string
): Promise<ProfileFacts | null> {
  const p = await prisma.talentProfile.findUnique({
    where: { userId },
    select: {
      completedAt: true,
      updatedAt: true,
      resumeKey: true,
      yearsExperience: true,
      industries: true,
      targetRoles: true,
      _count: { select: { educations: true } },
    },
  })
  if (!p) return null
  return {
    complete: isProfileComplete({
      educationCount: p._count.educations,
      hasResume: !!p.resumeKey,
      ...p,
    }),
    completedAt: p.completedAt,
    updatedAt: p.updatedAt,
  }
}
