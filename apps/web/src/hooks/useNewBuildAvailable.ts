import { useEffect, useState } from 'react'

const POLL_MS = 60_000

/**
 * True once a newer deploy exists than the bundle this tab loaded. An SPA
 * never reloads on its own, so a tab open across a deploy keeps running old
 * code. Compares the baked-in build id to /version.json (emitted at build
 * time). Fails quiet: dev server, offline or a missing file never flag.
 */
export function useNewBuildAvailable(): boolean {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    if (typeof __BUILD_ID__ === 'undefined') return
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const { id } = (await res.json()) as { id?: string }
        if (!cancelled && id && id !== __BUILD_ID__) setStale(true)
      } catch {
        // offline / not JSON (SPA fallback html) — ignore
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const timer = setInterval(check, POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    void check()
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return stale
}
