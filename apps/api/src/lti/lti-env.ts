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
