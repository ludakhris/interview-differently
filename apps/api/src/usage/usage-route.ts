/**
 * Turns a raw browser path into a storable route pattern (#42 Phase 2).
 * Allowlist only: anything unrecognised becomes "/other", so ids, invite
 * codes and query strings never reach the table. `refId` is kept solely for
 * scenario pages, where the scenario id is the point (interest vs starts).
 */
export interface NormalizedRoute {
  route: string
  refId: string | null
}

const RULES: { re: RegExp; route: string; ref?: boolean }[] = [
  { re: /^\/$/, route: '/' },
  { re: /^\/dashboard$/, route: '/dashboard' },
  { re: /^\/scenario\/([^/]+)\/briefing$/, route: '/scenario/:id/briefing', ref: true },
  { re: /^\/scenario\/([^/]+)\/play$/, route: '/scenario/:id/play', ref: true },
  { re: /^\/scenario\/([^/]+)\/immersive$/, route: '/scenario/:id/immersive', ref: true },
  {
    re: /^\/scenario\/([^/]+)\/immersive\/[^/]+\/feedback$/,
    route: '/scenario/:id/feedback',
    ref: true,
  },
  { re: /^\/scenario\/([^/]+)\/feedback(\/[^/]+)?$/, route: '/scenario/:id/feedback', ref: true },
  { re: /^\/tools\/sql$/, route: '/tools/sql' },
  { re: /^\/tools\/assessments$/, route: '/tools/assessments' },
  { re: /^\/tools\/assessments\/attempt\/[^/]+$/, route: '/tools/assessments/attempt' },
  { re: /^\/tools\/assessments\/attempt\/[^/]+\/result$/, route: '/tools/assessments/result' },
  { re: /^\/a\/[^/]+$/, route: '/a/:code' },
  { re: /^\/settings$/, route: '/settings' },
  { re: /^\/welcome$/, route: '/welcome' },
  { re: /^\/request-scenario$/, route: '/request-scenario' },
  { re: /^\/builder(\/.*)?$/, route: '/builder' },
  { re: /^\/admin(\/.*)?$/, route: '/admin' },
]

export function normalizeRoute(rawPath: unknown): NormalizedRoute | null {
  if (typeof rawPath !== 'string' || rawPath.length === 0 || rawPath.length > 300) return null
  const path = rawPath.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  for (const rule of RULES) {
    const m = rule.re.exec(path)
    if (m) return { route: rule.route, refId: rule.ref ? decode(m[1]).slice(0, 100) : null }
  }
  return { route: '/other', refId: null }
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Which tool (TOOL_KEYS) a route opens, if any. */
export function toolForRoute(route: string): 'sql-sandbox' | 'assessments' | null {
  if (route === '/tools/sql') return 'sql-sandbox'
  if (route.startsWith('/tools/assessments')) return 'assessments'
  return null
}
