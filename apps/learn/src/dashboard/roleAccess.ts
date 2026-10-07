/** Roles the API accepts for provider participant records (talent, notes, support). Mirrors PROVIDER_STAFF_ROLES. */
const TALENT_ROLES = ['provider-admin', 'system-admin']
/** Roles the API accepts for activity logs. Mirrors COHORT_STAFF_ROLES plus system admins. */
const ACTIVITY_ROLES = ['agency-admin', 'provider-admin', 'system-admin']

export const canSeeTalent = (role: string | undefined): boolean =>
  role !== undefined && TALENT_ROLES.includes(role)

export const canSeeActivity = (role: string | undefined): boolean =>
  role !== undefined && ACTIVITY_ROLES.includes(role)
