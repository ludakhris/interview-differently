import { useState, useEffect } from 'react'
import { fetchScenarios, fetchScenario, type ScenariosData, type TrackMeta } from '@/services/scenariosService'
import type { Scenario } from '@id/types'

export type { TrackMeta }

export function useScenarios() {
  const [data, setData] = useState<ScenariosData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    fetchScenarios()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false))
  }, [])

  return {
    scenarios: data?.scenarios ?? [],
    trackMeta: data?.trackMeta ?? {},
    isLoading,
    error,
  }
}

export function useScenario(id: string | undefined) {
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!id) {
      setIsLoading(false)
      return
    }
    fetchScenario(id)
      .then(setScenario)
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false))
  }, [id])

  return { scenario, isLoading, error }
}
