import { resolveSite } from './site'

/**
 * App pages (the signed-in dashboard and, later, the rest of the LMS) separate
 * two things the marketing pages treat as one:
 *   - tenant: whose data to show (e.g. "delaware"), from the host or ?site=
 *   - brand:  which skin to wear. A tenant host wears the tenant's brand;
 *             learndifferently.tech wears LearnDifferently's, so
 *             delaware.learndifferently.tech/dashboard and
 *             learndifferently.tech/dashboard?site=delaware show the same data
 *             in two skins. ?brand=learn|delaware forces either skin.
 */
export type Brand = 'learn' | 'delaware'

export interface AppContext {
  tenant: string | null
  /** True when the host names the tenant (delaware.learndifferently.tech), so it cannot be switched. */
  fixedTenant: boolean
  brand: Brand
  /** ?site= and ?brand= as given, so links keep the experience the visitor chose. */
  query: string
}

const SLUG = /^[a-z0-9-]{1,40}$/

export function resolveContext(hostname: string, search: string): AppContext {
  const params = new URLSearchParams(search)
  const hostSite = resolveSite(hostname, '')
  const hostTenant = hostSite === 'home' ? null : hostSite
  // On a tenant host the host decides; elsewhere ?site= picks the workspace
  // (the API checks the signed-in person may open it).
  const site = params.get('site')
  const slug = site && site !== 'home' && SLUG.test(site) ? site : null
  const tenant = hostTenant ?? slug

  const wanted = params.get('brand')
  let brand: Brand = hostTenant === 'delaware' ? 'delaware' : 'learn'
  if (wanted === 'learn') brand = 'learn'
  if (wanted === 'delaware' && tenant === 'delaware') brand = 'delaware'

  const keep = new URLSearchParams()
  for (const key of ['site', 'brand']) {
    const v = params.get(key)
    if (v) keep.set(key, v)
  }
  const query = keep.toString()
  return { tenant, fixedTenant: hostTenant !== null, brand, query: query ? `?${query}` : '' }
}

/** A path with the visitor's ?site=/?brand= carried along. */
export const withContext = (ctx: AppContext, path: string): string => `${path}${ctx.query}`

/** The same page with the brand switched. */
export function withBrand(search: string, pathname: string, brand: Brand): string {
  const params = new URLSearchParams(search)
  params.set('brand', brand)
  return `${pathname}?${params.toString()}`
}
