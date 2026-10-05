import { isLearnOrigin } from './auth/learn-origin'

type OriginCallback = (err: Error | null, allow?: boolean) => void

/**
 * CORS origin check. FRONTEND_URL is a comma-separated list (Interview
 * Differently's frontend); LearnDifferently origins are matched by pattern so a
 * new tenant subdomain needs no config change.
 */
export function corsOrigin(frontendUrl: string | undefined) {
  const allowed = (frontendUrl ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  return (origin: string | undefined, callback: OriginCallback) => {
    // No Origin header: not a browser cross-origin request.
    if (!origin) return callback(null, true)
    callback(null, allowed.includes(origin) || isLearnOrigin(origin))
  }
}
