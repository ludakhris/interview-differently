/**
 * Frontend client for /api/me/* — caller-scoped endpoints.
 *
 * All endpoints sit behind AuthenticatedGuard on the API. Callers pass a
 * Clerk Bearer token via `getToken: () => Promise<string | null>` so the
 * caller controls token refresh.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export type GetToken = () => Promise<string | null>

export interface InstitutionSuggestion {
  institution: { id: string; name: string; emailDomain: string | null } | null
  email: string | null
}

export interface MyMembership {
  membershipId: string
  institution: { id: string; name: string }
  cohort: { id: string; name: string } | null
  joinedAt: string
}

async function authedFetch(
  getToken: GetToken,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getToken()
  if (!token) throw new Error('Not signed in')
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { message?: string | string[] }
      if (body.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message
    } catch {
      // not json — keep status text
    }
    throw new Error(message)
  }
  return res
}

export async function fetchInstitutionSuggestion(getToken: GetToken): Promise<InstitutionSuggestion> {
  const res = await authedFetch(getToken, '/me/institution-suggestion')
  return res.json() as Promise<InstitutionSuggestion>
}

export async function fetchMyMemberships(getToken: GetToken): Promise<MyMembership[]> {
  const res = await authedFetch(getToken, '/me/memberships')
  return res.json() as Promise<MyMembership[]>
}

export async function joinByInstitution(
  getToken: GetToken,
  institutionId: string,
): Promise<{ membershipId: string }> {
  const res = await authedFetch(getToken, '/me/memberships', {
    method: 'POST',
    body: JSON.stringify({ institutionId }),
  })
  return res.json() as Promise<{ membershipId: string }>
}

export async function joinByKey(
  getToken: GetToken,
  joinKey: string,
): Promise<{ membershipId: string; institutionId: string; cohortId: string | null }> {
  const res = await authedFetch(getToken, '/me/memberships', {
    method: 'POST',
    body: JSON.stringify({ joinKey }),
  })
  return res.json() as Promise<{ membershipId: string; institutionId: string; cohortId: string | null }>
}

export async function leaveMembership(getToken: GetToken, membershipId: string): Promise<void> {
  await authedFetch(getToken, `/me/memberships/${membershipId}`, { method: 'DELETE' })
}
