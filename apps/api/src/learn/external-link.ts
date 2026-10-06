/**
 * Sites an author may link a course item to. A host matches itself and its
 * subdomains (so business.udemy.com matches udemy.com). LinkedIn is limited to
 * its Learning path because the rest of the site is not training content.
 */
const ALLOWED: { domain: string; pathPrefix?: string }[] = [
  { domain: 'udemy.com' },
  { domain: 'coursera.org' },
  { domain: 'khanacademy.org' },
  { domain: 'edx.org' },
  { domain: 'learn.microsoft.com' },
  { domain: 'skillshop.withgoogle.com' },
  { domain: 'pluralsight.com' },
  { domain: 'linkedin.com', pathPrefix: '/learning' },
]

export interface ExternalLink {
  url: string
  host: string
}

/**
 * The link to open, or null if it is not an https link on an allowed site.
 * The query string is kept (course links can carry a coupon or a section);
 * the fragment is dropped.
 */
export function parseExternalLink(input: unknown): ExternalLink | null {
  if (typeof input !== 'string') return null
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  const allowed = ALLOWED.some(
    (a) =>
      (host === a.domain || host.endsWith(`.${a.domain}`)) &&
      (!a.pathPrefix ||
        url.pathname === a.pathPrefix ||
        url.pathname.startsWith(`${a.pathPrefix}/`))
  )
  if (!allowed) return null
  return { url: `https://${host}${url.pathname}${url.search}`, host }
}

/** The sites an author can link to, for the error message and the editor hint. */
export const ALLOWED_LINK_SITES = ALLOWED.map((a) => a.domain)
