/**
 * Who may do what in Learn Differently (GitHub issue #84). One table: an action names what a person is
 * doing, and the roles that may do it. A new role is a new entry in `ROLES` and a few rows below, never a
 * new branch in a service.
 *
 * A role is held through a membership (`Membership.role`): the person, the institution it applies to, and
 * for an instructor the cohort. Only the platform administrator is not: it lives on the person's Learn
 * Differently account (Clerk `publicMetadata.role`) and may do everything.
 *
 * The database already keeps one agency's data from another's (row-level security, docs/tenant-isolation.md).
 * This table is the second layer: what a person may do inside the agencies they belong to.
 */

/** The platform administrator: runs the platform, may do everything. Held on the account, not a membership. */
export const SYSTEM_ADMIN = 'system-admin'

/** Roles held through a membership. */
export const ROLES = {
  agencyAdmin: 'agency-admin',
  providerAdmin: 'provider-admin',
  /** A provider-admin for an organization that hosts cohorts: the same actions, in its own workspace. */
  organizationAdmin: 'organization-admin',
  /** Reads outcomes and gradebooks; no participant records. */
  caseManager: 'case-manager',
  /** Teaches one cohort: its roster, attendance and gradebook. */
  instructor: 'instructor',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

/** Roles from least to most access, for listing and for picking the highest one someone holds. */
export const ROLE_ORDER: Role[] = [
  ROLES.instructor,
  ROLES.caseManager,
  ROLES.organizationAdmin,
  ROLES.providerAdmin,
  ROLES.agencyAdmin,
]

export const isRole = (v: unknown): v is Role => ROLE_ORDER.includes(v as Role)

/**
 * The roles that mean "staff of this provider or organization": they may read its participant records.
 * Agency admins and case managers are deliberately not here (docs/talent-and-attendance-design.md).
 */
const INSTITUTION_ADMINS: Role[] = [ROLES.providerAdmin, ROLES.organizationAdmin]

/** Everyone who runs courses and cohorts. */
const MANAGERS: Role[] = [ROLES.agencyAdmin, ...INSTITUTION_ADMINS]

export const PERMISSIONS = {
  /** Open a workspace and see its cohorts. An instructor sees only their cohorts in it. */
  'workspace.open': [...MANAGERS, ROLES.caseManager, ROLES.instructor],
  /** Workspace-wide outcomes. */
  'outcomes.read': [...MANAGERS, ROLES.caseManager],
  /** One cohort's gradebook. */
  'gradebook.read': [...MANAGERS, ROLES.caseManager, ROLES.instructor],
  /** The exit file (every learner's record as a spreadsheet). */
  'exit-file.read': MANAGERS,
  /** Create and change courses, modules and items, and offer a course to organizations. */
  'course.manage': MANAGERS,
  /** Read a cohort and its roster. An instructor, for their own cohort. */
  'cohort.read': [...MANAGERS, ROLES.instructor],
  /** Create and change cohorts, and run their rosters and join requests. */
  'cohort.manage': MANAGERS,
  /** Work a cohort day to day: attendance, activity, a learner's record. An instructor, for their own cohort. */
  'cohort.staff': [...MANAGERS, ROLES.instructor],
  /** Read and write an institution's participant records: notes, support items, talent profiles. */
  'participant.records': INSTITUTION_ADMINS,
  /** Give and take away roles at a workspace (see GRANTABLE for which). */
  'members.manage': MANAGERS,
  /** Platform administration: the platform-administrator role, connected tools. Only the platform administrator. */
  'platform.admin': [],
} as const satisfies Record<string, readonly Role[]>

export type Action = keyof typeof PERMISSIONS

/** Whether `roles` (and nothing else) allow the action. The platform administrator is checked by the caller. */
export const allows = (roles: readonly string[], action: Action): boolean =>
  roles.some((r) => (PERMISSIONS[action] as readonly string[]).includes(r))

/** The highest-access role in the list, if any. */
export function highestRole(roles: readonly string[]): Role | undefined {
  return [...ROLE_ORDER].reverse().find((r) => roles.includes(r))
}

/**
 * The roles each role may give, at its own workspace (an agency admin's covers the agency and what reports to
 * it). The platform administrator may give any. Nobody may give a role above their own.
 */
export const GRANTABLE: Record<string, readonly Role[]> = {
  [ROLES.agencyAdmin]: ROLE_ORDER,
  [ROLES.providerAdmin]: [
    ROLES.providerAdmin,
    ROLES.organizationAdmin,
    ROLES.caseManager,
    ROLES.instructor,
  ],
  [ROLES.organizationAdmin]: [
    ROLES.providerAdmin,
    ROLES.organizationAdmin,
    ROLES.caseManager,
    ROLES.instructor,
  ],
}
