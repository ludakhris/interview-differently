import type { LearnWorkspace } from '@id/types'

/** Every role the API can report, least access first. Mirrors the API's role table. */
export const ROLE_ORDER = [
  'instructor',
  'case-manager',
  'organization-admin',
  'provider-admin',
  'agency-admin',
  'system-admin',
] as const

export const SYSTEM_ADMIN = 'system-admin'

/** Agency, provider and organization admins (and platform administrators): run a workspace. */
const ADMIN_ROLES: readonly string[] = [
  'agency-admin',
  'provider-admin',
  'organization-admin',
  SYSTEM_ADMIN,
]
/** Participant records (talent, notes, support) belong to the institution that keeps them. */
const TALENT_ROLES: readonly string[] = ['provider-admin', 'organization-admin', SYSTEM_ADMIN]

const inList = (list: readonly string[], role: string | undefined): boolean =>
  role !== undefined && list.includes(role)

/** The highest role in a list; roles the app does not know are ignored. */
export function highestRole(roles: Array<string | undefined>): string | undefined {
  let best = -1
  for (const r of roles) {
    const i = r === undefined ? -1 : ROLE_ORDER.indexOf(r as (typeof ROLE_ORDER)[number])
    if (i > best) best = i
  }
  return best < 0 ? undefined : ROLE_ORDER[best]
}

/**
 * What the person is across the app. Only a platform administrator comes from the account; every
 * other role is held at a workspace, so it is the highest one they hold in any workspace.
 */
export function overallRole(
  accountRole: string | undefined,
  workspaces: LearnWorkspace[] | null
): string | undefined {
  if (accountRole === SYSTEM_ADMIN) return SYSTEM_ADMIN
  return highestRole((workspaces ?? []).map((w) => w.role))
}

/** The person's role in one workspace, by subdomain. */
export function roleIn(
  workspaces: LearnWorkspace[] | null | undefined,
  subdomain: string | null | undefined
): string | undefined {
  const w = workspaces?.find((x) => x.subdomain === subdomain)
  return w ? highestRole([w.role]) : undefined
}

/** Course and cohort management, join approvals, adding learners, offers. */
export const canManageWorkspace = (role: string | undefined): boolean => inList(ADMIN_ROLES, role)

/** Exit file and other participant exports. */
export const canExportExitFile = canManageWorkspace

/** Outcomes dashboard. Case managers read it; instructors do not. */
export const canSeeOutcomes = (role: string | undefined): boolean =>
  canManageWorkspace(role) || role === 'case-manager'

/** Cohorts, rosters, attendance, gradebooks and the activity log. */
export const canSeeCohorts = (role: string | undefined): boolean =>
  canManageWorkspace(role) || role === 'instructor'

/** Roles the API accepts for participant records (talent, notes, support). */
export const canSeeTalent = (role: string | undefined): boolean => inList(TALENT_ROLES, role)

/** Roles the API accepts for activity logs. */
export const canSeeActivity = canSeeCohorts

/** Who may add and remove the people who hold roles at a workspace. */
export const canManageMembers = canManageWorkspace

/** Where a person lands in a workspace when no page is named. */
export function homePath(role: string | undefined, isProvider: boolean): string {
  if (canManageWorkspace(role)) return isProvider ? '/lms/courses' : '/lms/cohorts'
  if (canSeeCohorts(role)) return '/lms/cohorts'
  return '/lms/dashboard'
}

/** The name of the staff page and its menu entry for a workspace of this kind: "Manage Provider Staff". */
export function staffPageLabel(kind: string | undefined): string {
  const noun = kind === 'agency' ? 'Agency' : kind === 'provider' ? 'Provider' : 'Organization'
  return `Manage ${noun} Staff`
}
