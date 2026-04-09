import { useState, useEffect } from 'react'
import { fetchProfile, type CompetencyProfile } from '@/services/resultsService'

export function useProfile(userId: string | null | undefined, refreshKey?: number) {
  const [profile, setProfile] = useState<CompetencyProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      return
    }
    setIsLoading(true)
    fetchProfile(userId)
      .then(setProfile)
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false))
  }, [userId, refreshKey])

  return { profile, isLoading, error }
}
