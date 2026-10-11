import { useEffect, useState } from 'react'
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/**
 * A small tag in the corner when this page's API is not production, so a preview or a test system can never be
 * mistaken for the real one. It asks the API itself (GET /health) which environment it is, rather than guessing
 * from the URL, so it says what the page is really talking to. Production, a local API and any failure show nothing.
 * Copy of apps/learn/src/EnvironmentBanner.tsx (the two apps share no UI package); this app's API URL has no /api.
 */
export function EnvironmentBanner({ healthUrl = `${API_URL}/api/health` }: { healthUrl?: string }) {
  const [environment, setEnvironment] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(healthUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { environment?: string } | null) => {
        const env = body?.environment
        if (!cancelled && env && env !== 'production' && env !== 'local') setEnvironment(env)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [healthUrl])

  if (!environment) return null
  return (
    <div
      role="status"
      title={`This page is talking to the ${environment} API, not production.`}
      style={{
        position: 'fixed',
        right: 14,
        bottom: 14,
        zIndex: 2147483000,
        padding: '9px 18px',
        borderRadius: 999,
        border: '2px solid #fff',
        background: '#c2410c',
        color: '#fff',
        font: '800 14px/1.3 system-ui, sans-serif',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
        pointerEvents: 'none',
      }}
    >
      <span aria-hidden="true">⚠️ </span>
      Test system · {environment} · not production
    </div>
  )
}
