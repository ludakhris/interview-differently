/**
 * What the restricted database role the API connects as (scripts/create-app-role.ts) may execute. Policies call
 * these as the caller, and the API's context statement calls the last two. Every other function (the triggers, the
 * helpers that look across agencies) runs only as the database owner. The database specs grant exactly this list, so
 * they test the real privileges.
 */
export const APP_ROLE_FUNCTIONS: readonly string[] = [
  'app_agency_ids()',
  'app_user_id()',
  'app_enrollment_ids()',
  'app_enrolled_cohort_ids()',
  'app_cohort_ids()',
  'app_visible_course_ids()',
  'app_visible_module_ids()',
  'app_can_self_enroll(text)',
  'app_cohort_needs_approval(text)',
  'agencies_of_user(text)',
  'all_agency_ids()',
]

/** SQL that gives `role` its table access and exactly the functions above, and nothing else. `role` is a plain identifier. */
export function appRoleGrantsSql(role: string): string[] {
  return [
    `GRANT USAGE ON SCHEMA public TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
    `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ${role}`,
    ...APP_ROLE_FUNCTIONS.map((f) => `GRANT EXECUTE ON FUNCTION ${f} TO ${role}`),
  ]
}
