/**
 * Frontend client for the institution + cohort admin endpoints.
 *
 * All endpoints sit behind AdminGuard on the API. Callers must pass a Clerk
 * Bearer token obtained via `useAuth().getToken()`. We accept it as a
 * `getToken: () => Promise<string | null>` so the caller controls token
 * refresh — passing a single string here would race with token expiry on
 * long-lived pages.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export type GetToken = () => Promise<string | null>

export interface Institution {
  id: string
  name: string
  /** Optional. Null means students can't auto-join by email — they use the cohort joinKey or are admin-added. */
  emailDomain: string | null
  createdAt: string
  cohortCount: number
  memberCount: number
}

export interface Cohort {
  id: string
  name: string
  joinKey: string | null
  createdAt: string
  memberCount: number
}

export interface InstitutionDetail {
  id: string
  name: string
  emailDomain: string | null
  createdAt: string
  memberCount: number
  cohorts: Cohort[]
}

export interface CohortMember {
  membershipId: string
  userId: string
  email: string | null
  displayName: string | null
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
      // body wasn't json — keep status text
    }
    throw new Error(message)
  }
  return res
}

// ── Institutions ───────────────────────────────────────────────────────────

export async function listInstitutions(getToken: GetToken): Promise<Institution[]> {
  const res = await authedFetch(getToken, '/admin/institutions')
  return res.json() as Promise<Institution[]>
}

export async function getInstitution(getToken: GetToken, id: string): Promise<InstitutionDetail> {
  const res = await authedFetch(getToken, `/admin/institutions/${id}`)
  return res.json() as Promise<InstitutionDetail>
}

export async function createInstitution(
  getToken: GetToken,
  payload: { name: string; emailDomain?: string | null },
): Promise<Institution> {
  const res = await authedFetch(getToken, '/admin/institutions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.json() as Promise<Institution>
}

export async function updateInstitution(
  getToken: GetToken,
  id: string,
  payload: { name?: string; emailDomain?: string | null },
): Promise<Institution> {
  const res = await authedFetch(getToken, `/admin/institutions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  return res.json() as Promise<Institution>
}

export async function deleteInstitution(getToken: GetToken, id: string): Promise<void> {
  await authedFetch(getToken, `/admin/institutions/${id}`, { method: 'DELETE' })
}

// ── Cohorts ────────────────────────────────────────────────────────────────

export async function createCohort(
  getToken: GetToken,
  institutionId: string,
  payload: { name: string; joinKey?: string | null },
): Promise<Cohort> {
  const res = await authedFetch(getToken, `/admin/institutions/${institutionId}/cohorts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.json() as Promise<Cohort>
}

export async function updateCohort(
  getToken: GetToken,
  cohortId: string,
  payload: { name?: string; joinKey?: string | null },
): Promise<Cohort> {
  const res = await authedFetch(getToken, `/admin/cohorts/${cohortId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  return res.json() as Promise<Cohort>
}

export async function deleteCohort(getToken: GetToken, cohortId: string): Promise<void> {
  await authedFetch(getToken, `/admin/cohorts/${cohortId}`, { method: 'DELETE' })
}

export async function listCohortMembers(getToken: GetToken, cohortId: string): Promise<CohortMember[]> {
  const res = await authedFetch(getToken, `/admin/cohorts/${cohortId}/members`)
  return res.json() as Promise<CohortMember[]>
}

export async function addCohortMember(
  getToken: GetToken,
  cohortId: string,
  payload: { email?: string; userId?: string },
): Promise<{ membershipId: string; userId: string }> {
  const res = await authedFetch(getToken, `/admin/cohorts/${cohortId}/members`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.json() as Promise<{ membershipId: string; userId: string }>
}

export async function removeCohortMember(
  getToken: GetToken,
  cohortId: string,
  membershipId: string,
): Promise<void> {
  await authedFetch(getToken, `/admin/cohorts/${cohortId}/members/${membershipId}`, {
    method: 'DELETE',
  })
}
