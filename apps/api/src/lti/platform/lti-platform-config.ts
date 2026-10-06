import type { PlatformRegistration, ToolRegistration } from '../lti-spec'

const env = (name: string): string | undefined => process.env[name]?.trim() || undefined

/** Base URL of the API, including the `/api` prefix. */
export const apiBase = (): string =>
  (env('LTI_API_BASE') ?? 'http://localhost:3000/api').replace(/\/+$/, '')

/** The platform's own registration: where tools find its auth, token and key endpoints. */
export function platformRegistration(): PlatformRegistration {
  const base = apiBase()
  return {
    issuer: env('LTI_PLATFORM_ISSUER') ?? new URL(base).origin,
    clientId: env('LTI_PLATFORM_CLIENT_ID') ?? 'ld-platform',
    deploymentId: env('LTI_DEPLOYMENT_ID') ?? '1',
    authUrl: `${base}/lti/platform/auth`,
    tokenUrl: `${base}/lti/platform/token`,
    jwksUrl: `${base}/lti/platform/jwks`,
  }
}

/** The tools a course item may launch (static for the POC; each field overridable by env). */
export function registeredTools(): ToolRegistration[] {
  const base = apiBase()
  return [
    {
      toolId: 'id-interview',
      name: env('LTI_TOOL_NAME') ?? 'Interview Differently',
      clientId: env('LTI_TOOL_CLIENT_ID') ?? 'ld-platform',
      deploymentId: env('LTI_TOOL_DEPLOYMENT_ID') ?? '1',
      loginUrl: env('LTI_TOOL_LOGIN_URL') ?? `${base}/lti/tool/login`,
      launchUrl: env('LTI_TOOL_LAUNCH_URL') ?? `${base}/lti/tool/launch`,
      jwksUrl: env('LTI_TOOL_JWKS_URL') ?? `${base}/lti/tool/jwks`,
    },
  ]
}

export const registeredToolIds = (): string[] => registeredTools().map((t) => t.toolId)
export const toolById = (id: unknown): ToolRegistration | undefined =>
  registeredTools().find((t) => t.toolId === id)
