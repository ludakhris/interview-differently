import { authHeader } from './authToken'

/**
 * Admin client for the LTI platforms that can send learners into Interview Differently.
 * `/api/lti/platforms*` sits behind the ID admin guard.
 */
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export interface LtiPlatform {
  id: string
  name: string
  issuer: string
  clientId: string
  deploymentId: string
  authUrl: string
  tokenUrl: string
  jwksUrl: string
  enabled: boolean
  /** Null until the platform is first switched on; kept after a later switch off. */
  approvedAt: string | null
  createdAt: string
  source: 'registered' | 'built-in'
}

export type PlatformChangeAction = 'created' | 'updated' | 'enabled' | 'disabled' | 'rejected'

export interface PlatformChange {
  id: string
  subjectId: string
  subjectName: string
  action: PlatformChangeAction
  userName: string | null
  changes?: unknown
  createdAt: string
}

/** An API failure, with the HTTP status so callers can tell 403 from the rest. */
export class PlatformsApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api/lti/platforms${path}`, {
    ...init,
    headers: {
      ...(await authHeader()),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`.trim()
    try {
      const body = (await res.json()) as { message?: string | string[] }
      if (body.message)
        message = Array.isArray(body.message) ? body.message.join(', ') : body.message
    } catch {
      // not json, keep the status text
    }
    throw new PlatformsApiError(message, res.status)
  }
  return (await res.json()) as T
}

/** The addresses a platform needs from Interview Differently; absent from an older API. */
export interface ToolEndpointsResponse {
  registrationUrl: string
  loginUrl: string
  launchUrl: string
  jwksUrl: string
}

export async function listPlatforms(): Promise<LtiPlatform[]> {
  return (await listPlatformsWithEndpoints()).platforms
}

export function listPlatformsWithEndpoints(): Promise<{
  platforms: LtiPlatform[]
  endpoints?: Partial<ToolEndpointsResponse>
}> {
  return call('')
}

export function setPlatformEnabled(id: string, enabled: boolean): Promise<LtiPlatform> {
  return call<LtiPlatform>(`/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

/** Removes a platform that was never approved. */
export async function rejectPlatform(id: string): Promise<void> {
  await call<{ ok: true }>(`/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Newest first. */
export async function listPlatformHistory(subjectId: string): Promise<PlatformChange[]> {
  const q = `?subjectId=${encodeURIComponent(subjectId)}`
  return (await call<{ changes: PlatformChange[] }>(`/history${q}`)).changes
}
