import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { listInstitutions } from '@/services/institutionsService'
import { useRole } from './useRole'

export interface OwnerOption {
  /** null = platform-wide (full admins only) */
  id: string | null
  label: string
}

/**
 * Who can own new datasets/assessments (#25 Phase 5b). Full admins get
 * "Platform" plus every institution; institution-admins get their own
 * institutions (the API already filters the list).
 */
export function useOwnerOptions(): OwnerOption[] {
  const { getToken } = useAuth()
  const { isAdmin } = useRole()
  const [options, setOptions] = useState<OwnerOption[]>([])
  useEffect(() => {
    listInstitutions(getToken)
      .then((list) => {
        const insts = list.map((i) => ({ id: i.id, label: i.name }))
        setOptions(isAdmin ? [{ id: null, label: 'Platform (all institutions)' }, ...insts] : insts)
      })
      .catch(() => setOptions(isAdmin ? [{ id: null, label: 'Platform (all institutions)' }] : []))
  }, [getToken, isAdmin])
  return options
}
