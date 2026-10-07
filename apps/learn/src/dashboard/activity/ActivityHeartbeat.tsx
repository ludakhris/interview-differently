import { useAuth } from '@clerk/clerk-react'
import { useEffect, useRef } from 'react'
import { API_URL } from '../api'
import { parseLearningPath, type LearningTarget } from './activityLogic'
import { startHeartbeat, type Heartbeat } from './heartbeat'

/**
 * #69 E: sends the learner's heartbeat while a learner page is open, visible and the learner active.
 * Mounted once by DashboardApp on every /lms/learning/* page; it reads the cohort and item from
 * `pathname` (/lms/learning/:cohortId[/:itemId]). Renders nothing, does nothing when signed out,
 * and never shows an error. The timing rules are in heartbeat.ts; the server counts the time.
 */
export function ActivityHeartbeat({ pathname }: { pathname: string }) {
  const { isSignedIn, getToken } = useAuth()
  const token = useRef<string | null>(null)
  // Kept in a ref so a new function identity never restarts the heartbeat.
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken
  const beat = useRef<Heartbeat | null>(null)

  useEffect(() => {
    if (!isSignedIn) {
      // Signed out: never reuse the last learner's token for a closing page.
      token.current = null
      return
    }
    // A closing page cannot wait for a token, so keep one fresh: refresh whenever the page is
    // shown or hidden (Clerk tokens live about a minute), on top of every beat.
    const refresh = () => {
      getTokenRef
        .current()
        .then((t) => {
          if (t) token.current = t
        })
        .catch(() => {})
    }
    document.addEventListener('visibilitychange', refresh)
    const hb = startHeartbeat({
      async send(target: LearningTarget, keepalive: boolean) {
        // A closing page cannot wait for a fresh token: it reuses the one cached above.
        const t = keepalive ? token.current : await getTokenRef.current()
        if (!t) throw new Error('no token')
        token.current = t
        const res = await fetch(`${API_URL}/learn/me/activity/heartbeat`, {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ cohortId: target.cohortId, itemId: target.itemId, kind: 'page' }),
        })
        if (!res.ok) throw new Error(`heartbeat ${res.status}`)
      },
    })
    beat.current = hb
    return () => {
      hb.stop()
      beat.current = null
      document.removeEventListener('visibilitychange', refresh)
      token.current = null
    }
  }, [isSignedIn])

  useEffect(() => {
    // Declared after the effect above, so on first mount the heartbeat exists when this runs.
    beat.current?.setTarget(parseLearningPath(pathname))
  }, [pathname, isSignedIn])

  return null
}
