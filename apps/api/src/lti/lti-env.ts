/**
 * Key and secret configuration both sides share. Imports only lti-spec.
 */
import { generateKeyPair, keyPairFromPem } from './lti-spec'
import type { KeyPair } from './lti-spec'

/** What a production deployment must set; outside production each is generated at boot. */
export const REQUIRED_IN_PRODUCTION = [
  'LTI_PLATFORM_PRIVATE_KEY',
  'LTI_TOOL_PRIVATE_KEY',
  'LTI_TOOL_SECRET',
  'LTI_HINT_SECRET',
  'LTI_API_BASE',
  'LTI_LEARN_URL',
  'LTI_ID_WEB_URL',
] as const

/** Throws when production is missing any key or secret, so a boot never runs on per-process random ones. */
export function assertLtiProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return
  const missing = REQUIRED_IN_PRODUCTION.filter((name) => !env[name]?.trim())
  if (missing.length > 0)
    throw new Error(`LTI is not configured for production: set ${missing.join(', ')}`)
}

/**
 * The signing key (from `currentVar`, else generated) and, if `previousVar` is set, the key it
 * replaced. Sides publish both in their JWKS and always sign with `current`.
 */
export function loadSigningKeys(
  currentVar: string,
  previousVar: string,
  env: NodeJS.ProcessEnv = process.env
): { current: KeyPair; previous?: KeyPair } {
  const pem = (name: string) => env[name]?.trim() && env[name]!.replace(/\\n/g, '\n')
  const currentPem = pem(currentVar)
  const current = currentPem ? keyPairFromPem(currentPem) : generateKeyPair()
  const previousPem = pem(previousVar)
  const previous = previousPem ? keyPairFromPem(previousPem) : undefined
  return { current, previous: previous && previous.kid !== current.kid ? previous : undefined }
}

/**
 * Whether `value` (an origin or URL) is a LearnDifferently origin for the app at `learnUrl`: the
 * exact learn origin (so local http development works), or https on the learn hostname or one of
 * its subdomains (tenant hosts such as delaware.learndifferently.tech) with the learn port. No
 * userinfo, no other scheme, no lookalike hosts.
 */
export function isLearnOrigin(value: unknown, learnUrl: string): boolean {
  if (typeof value !== 'string') return false
  try {
    const u = new URL(value)
    const learn = new URL(learnUrl)
    if (u.origin === learn.origin) return u.username === '' && u.password === ''
    return (
      u.protocol === 'https:' &&
      u.username === '' &&
      u.password === '' &&
      u.port === learn.port &&
      (u.hostname === learn.hostname ||
        (u.hostname.endsWith(`.${learn.hostname}`) &&
          !u.hostname.startsWith('.') &&
          !u.hostname.includes('..')))
    )
  } catch {
    return false
  }
}

const LOCAL_DB_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1']

/**
 * The LearnDifferently origin the demo seed bakes into the brand logo URL. The localhost fallback is
 * only for a laptop-local database; against any other host (including the shared dev database) an
 * unset LTI_LEARN_URL would store an unreachable logo, so it throws instead.
 */
export function resolveLearnOrigin(learnUrl: string | undefined, dbHost: string): string {
  const url = learnUrl?.trim()
  if (url) return url.replace(/\/+$/, '')
  if (LOCAL_DB_HOSTS.includes(dbHost)) return 'http://localhost:5174'
  throw new Error(
    `LTI_LEARN_URL is not set and the database host is "${dbHost}", not localhost. ` +
      'Set LTI_LEARN_URL to the public LearnDifferently URL so the brand logo URL is reachable.'
  )
}
