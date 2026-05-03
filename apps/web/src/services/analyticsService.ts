/**
 * Frontend client for /api/admin/analytics endpoints.
 *
 * Same auth pattern as institutionsService — caller passes a Clerk getToken
 * function and we attach a Bearer header. The backend gates these with
 * AdminGuard + @InstitutionAdminAllowed (so an institution-admin role,
 * once role-binding lands, will work too).
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export type GetToken = () => Promise<string | null>

export interface InstitutionAnalytics {
  institution: { id: string; name: string; emailDomain: string | null }
  cohort: { id: string; name: string } | null
  totalStudents: number
  activeStudentsLast30Days: number
  completedSimulations: number
  avgOverallScore: number | null
  byTrack: Array<{ key: string; count: number; avg: number }>
  byDimension: Array<{ key: string; count: number; avg: number }>
  byCohort: Array<{
    cohortId: string | null
    name: string
    totalStudents: number
    completedSimulations: number
    avgOverallScore: number | null
  }> | null
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
    },
  })
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { message?: string | string[] }
      if (body.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message
    } catch {
      // not json
    }
    throw new Error(message)
  }
  return res
}

export async function fetchInstitutionAnalytics(
  getToken: GetToken,
  institutionId: string,
  cohortId?: string,
): Promise<InstitutionAnalytics> {
  const qs = cohortId ? `?cohortId=${encodeURIComponent(cohortId)}` : ''
  const res = await authedFetch(getToken, `/admin/institutions/${institutionId}/analytics${qs}`)
  return res.json() as Promise<InstitutionAnalytics>
}
