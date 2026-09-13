import { useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { registerTokenGetter } from '@/services/authToken'

/** Hands Clerk's getToken to the builder/media services (see services/authToken.ts). */
export function useRegisterToken() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  useEffect(() => {
    if (!isLoaded) return // authHeader() waits until the first registration
    registerTokenGetter(isSignedIn ? () => getToken() : null)
  }, [getToken, isLoaded, isSignedIn])
}
