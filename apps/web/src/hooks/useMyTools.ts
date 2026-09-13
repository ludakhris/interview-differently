import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import type { ToolKey } from '@id/types'
import { fetchMyTools } from '@/services/toolsService'

// Nav renders on every page, so cache per user for the session rather than
// re-fetching /me/tools on each route change. Admins toggling flags see the
// change after a reload — acceptable for a per-cohort setting.
const cache = new Map<string, Promise<ToolKey[]>>()

/** Tools enabled for the signed-in user (empty while loading or signed out). */
export function useMyTools(): ToolKey[] {
  const { isSignedIn, userId, getToken } = useAuth()
  const [tools, setTools] = useState<ToolKey[]>([])

  useEffect(() => {
    if (!isSignedIn || !userId) {
      setTools([])
      return
    }
    let p = cache.get(userId)
    if (!p) {
      p = fetchMyTools(getToken).catch(() => {
        cache.delete(userId)
        return [] as ToolKey[]
      })
      cache.set(userId, p)
    }
    let cancelled = false
    p.then((t) => {
      if (!cancelled) setTools(t)
    })
    return () => {
      cancelled = true
    }
  }, [isSignedIn, userId, getToken])

  return tools
}
