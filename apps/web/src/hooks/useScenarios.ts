import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { fetchScenarios, fetchScenario, type ScenariosData, type TrackMeta } from '@/services/scenariosService'
import type { Scenario } from '@id/types'

export type { TrackMeta }

export function useScenarios() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const [data, setData] = useState<ScenariosData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // Wait for Clerk so a signed-in member's institution scenarios aren't
    // missed by a pre-load fetch as a guest.
    if (!isLoaded) return
    fetchScenarios(isSignedIn ? () => getToken() : undefined)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false))
  }, [isLoaded, isSignedIn, getToken])

  return {
    scenarios: data?.scenarios ?? [],
    trackMeta: data?.trackMeta ?? {},
    isLoading,
    error,
  }
}

/**
 * Fetch a single scenario, attaching the caller's Clerk session token when
 * available so the backend can return the full payload (nodes, exhibits,
 * quant model answers). Guests receive the summary form — enough to
 * render the briefing page but not the simulation, which is gated
 * client-side as well.
 */
export function useScenario(id: string | undefined) {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!id) {
      setIsLoading(false)
      return
    }
    // Wait for Clerk to finish loading before issuing the request — sending
    // it pre-load would race the session and we'd briefly fetch as a guest
    // even when the user is signed in, returning the stripped summary.
    if (!isLoaded) return
    const tokenFn = isSignedIn ? () => getToken() : undefined
    fetchScenario(id, tokenFn)
      .then(setScenario)
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false))
  }, [id, isLoaded, isSignedIn, getToken])

  return { scenario, isLoading, error }
}
