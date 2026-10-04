/**
 * Which site this host serves. learndifferently.online (and anything that
 * isn't a known tenant) is the public homepage; each tenant gets its own
 * subdomain, e.g. delaware.learndifferently.online.
 *
 * Tenants are hard-coded until branding moves to the database (#46).
 * Local dev: delaware.localhost:5174, or ?site=delaware on any host.
 */
export type Site = 'home' | 'delaware'

const TENANTS = new Map<string, Site>([['delaware', 'delaware']])

export function resolveSite(hostname: string, search: string): Site {
  const override = new URLSearchParams(search).get('site')
  if (override === 'home') return 'home'
  if (override && TENANTS.has(override)) return TENANTS.get(override)!
  const subdomain = hostname.split('.')[0].toLowerCase()
  return TENANTS.get(subdomain) ?? 'home'
}
