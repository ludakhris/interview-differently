import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import {
  acceptConsent,
  fetchConsents,
  type ConsentKind,
  type ConsentStatus,
} from '@/services/consentService'

/**
 * Consent status for the signed-in user. `status` is null while loading (or
 * if the API is unreachable — callers fail open on load errors so an outage
 * doesn't lock everyone out; the API still enforces recording consent itself).
 */
export function useConsents() {
  const { isSignedIn, userId, getToken } = useAuth()
  const [status, setStatus] = useState<ConsentStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSignedIn) return
    let cancelled = false
    fetchConsents(getToken)
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setError('load'))
    return () => {
      cancelled = true
    }
  }, [isSignedIn, userId, getToken])

  const accept = useCallback(
    async (kinds: ConsentKind[]) => {
      let s = status
      const required = s?.required ?? (await fetchConsents(getToken)).required
      for (const kind of kinds) s = await acceptConsent(getToken, kind, required[kind])
      setStatus(s)
    },
    [getToken, status]
  )

  return { status, loadFailed: error === 'load', accept }
}
