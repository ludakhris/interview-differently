import type { PlatformRegistration } from '../lti-spec'

const base = (): string =>
  (process.env.LTI_API_BASE ?? 'http://localhost:3000/api').replace(/\/$/, '')

/** Static registration of LearnDifferently as seen by this tool; every URL is env-overridable. */
export function platformRegistration(): PlatformRegistration {
  const b = base()
  return {
    issuer: process.env.LTI_PLATFORM_ISSUER ?? new URL(b).origin,
    clientId: process.env.LTI_TOOL_CLIENT_ID ?? 'ld-platform',
    deploymentId: process.env.LTI_DEPLOYMENT_ID ?? '1',
    authUrl: process.env.LTI_PLATFORM_AUTH_URL ?? `${b}/lti/platform/auth`,
    tokenUrl: process.env.LTI_PLATFORM_TOKEN_URL ?? `${b}/lti/platform/token`,
    jwksUrl: process.env.LTI_PLATFORM_JWKS_URL ?? `${b}/lti/platform/jwks`,
  }
}

export const launchUrl = (): string =>
  process.env.LTI_TOOL_LAUNCH_URL ?? `${base()}/lti/tool/launch`
export const returnUrl = (): string => process.env.LTI_RETURN_URL ?? 'http://localhost:5174'
export const useStubScoring = (): boolean => process.env.LTI_TOOL_SCORING === 'stub'
