import { useUser } from '@clerk/clerk-react'

export type Role = 'admin' | 'institution-admin' | null

/**
 * Clerk `publicMetadata.role`. `isAdmin` = full platform admin;
 * `isInstitutionAdmin` = promoted cohort member scoped to their own
 * institutions (#25 Phase 5); `isAnyAdmin` = either.
 */
export function useRole() {
  const { user } = useUser()
  const raw = user?.publicMetadata?.role
  const role: Role = raw === 'admin' || raw === 'institution-admin' ? raw : null
  return { role, isAdmin: role === 'admin', isInstitutionAdmin: role === 'institution-admin', isAnyAdmin: role !== null }
}
