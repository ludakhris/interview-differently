import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/clerk-react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/**
 * Fires once per signed-in session to refresh the User mirror row on the
 * API (caches Clerk email + display name so admins can later add the user
 * to a cohort by email). Idempotent — silently no-ops if already synced
 * this page load.
 *
 * Failures are logged but not surfaced — the mirror is a convenience for
 * admin tooling, not a blocker for the calling user.
 */
export function useUserSync() {
  const { isSignedIn, isLoaded, getToken, userId } = useAuth()
  const synced = useRef<string | null>(null)

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return
    if (synced.current === userId) return
    synced.current = userId

    void (async () => {
      try {
        const token = await getToken()
        if (!token) return
        await fetch(`${API_URL}/api/me/sync`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch (err) {
        // Non-fatal — the row will be backfilled lazily when an admin
        // adds this user by Clerk userId.
        console.warn('User mirror sync failed:', err)
        synced.current = null // allow retry on next mount
      }
    })()
  }, [isLoaded, isSignedIn, userId, getToken])
}
