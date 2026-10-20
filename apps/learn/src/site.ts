/**
 * Which site this host serves. learndifferently.tech (and anything that
 * isn't a known tenant) is the public homepage; each tenant gets its own
 * subdomain, e.g. delaware.learndifferently.tech.
 *
 * Tenants are hard-coded until branding moves to the database (#46).
 * Local dev: delaware.localhost:5174, or ?site=delaware on any host.
 * dsu is the Delaware State University Adult & Continuing Education demonstration site (#124).
 */
export type Site = 'home' | 'delaware' | 'dsu'

const TENANTS = new Map<string, Site>([
  ['delaware', 'delaware'],
  ['dsu', 'dsu'],
])

export function resolveSite(hostname: string, search: string): Site {
  const override = new URLSearchParams(search).get('site')
  if (override === 'home') return 'home'
  if (override && TENANTS.has(override)) return TENANTS.get(override)!
  const subdomain = hostname.split('.')[0].toLowerCase()
  return TENANTS.get(subdomain) ?? 'home'
}
