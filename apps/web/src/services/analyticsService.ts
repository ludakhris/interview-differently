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
  startedSimulations: number
  /** Percent (0–100). Null when nobody has started yet. */
  completionRate: number | null
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

// ── Engagement ─────────────────────────────────────────────────────────────

export interface ScenarioEngagementRow {
  scenarioId: string
  scenarioTitle: string
  starts: number
  completions: number
  /** Percent (0–100). Null when nobody started yet. */
  completionRate: number | null
  drops: number
  retriedUsers: number
  /** Mean overallScore from completions; null when none. Immersive sessions excluded. */
  avgScore: number | null
  mode: 'traditional' | 'immersive' | 'mixed'
}

export interface ScenarioEngagementResponse {
  institution: { id: string; name: string }
  cohort: { id: string; name: string } | null
  scenarios: ScenarioEngagementRow[]
}

export async function fetchScenarioEngagement(
  getToken: GetToken,
  institutionId: string,
  cohortId?: string,
): Promise<ScenarioEngagementResponse> {
  const qs = cohortId ? `?cohortId=${encodeURIComponent(cohortId)}` : ''
  const res = await authedFetch(getToken, `/admin/institutions/${institutionId}/engagement${qs}`)
  return res.json() as Promise<ScenarioEngagementResponse>
}
