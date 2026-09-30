import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useLocation } from 'react-router-dom'
import { trackPageView } from '@/services/usageService'

/**
 * Reports each route change for signed-in users (#42 Phase 2), so the admin
 * usage dashboard can see visits and tool opens, not just actions. Sends the
 * pathname only; the server strips it down to a route pattern.
 */
export function usePageViewTracking(): void {
  const { isSignedIn, getToken } = useAuth()
  const { pathname } = useLocation()
  // Also dedupes React StrictMode's double-invoked effects in dev.
  const last = useRef<string | null>(null)

  useEffect(() => {
    if (!isSignedIn || last.current === pathname) return
    last.current = pathname
    trackPageView(getToken, pathname)
  }, [isSignedIn, pathname, getToken])
}
