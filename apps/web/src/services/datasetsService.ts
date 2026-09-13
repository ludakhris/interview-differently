/**
 * Frontend client for SQL sandbox datasets (#25).
 *
 * `/admin/datasets/*` sits behind AdminGuard; `/me/datasets/*` behind
 * AuthenticatedGuard (any signed-in user — the API filters by cohort). Both
 * take `getToken` from `useAuth()` so the caller controls token refresh.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export type GetToken = () => Promise<string | null>

export interface SchemaColumn {
  name: string
  type: string
}

export interface SchemaTable {
  table: string
  columns: SchemaColumn[]
  rowCount: number
}

export interface DatasetSummary {
  id: string
  slug: string
  name: string
  description: string | null
  dialect: string
  schemaSummary: SchemaTable[]
}

/** null institution = platform-wide (read-only for institution-admins). */
export interface OwnedContent {
  institutionId: string | null
  institutionName: string | null
}

export interface AdminDatasetSummary extends DatasetSummary, OwnedContent {
  cohortCount: number
  updatedAt: string
}

export interface DatasetDetail extends DatasetSummary, OwnedContent {
  setupSql: string
  setupHash: string
  cohortIds: string[]
}

export interface DatasetInput {
  slug: string
  name: string
  description?: string | null
  setupSql: string
  /** Owner on create; ignored on update. */
  institutionId?: string | null
}

export interface CohortOption {
  id: string
  name: string
  institutionName: string
}

async function authedFetch(getToken: GetToken, path: string, init: RequestInit = {}): Promise<Response> {
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

// ── Student ────────────────────────────────────────────────────────────────

export async function fetchMyDatasets(getToken: GetToken): Promise<DatasetSummary[]> {
  const res = await authedFetch(getToken, '/me/datasets')
  return res.json() as Promise<DatasetSummary[]>
}

export async function fetchMyDataset(getToken: GetToken, slug: string): Promise<DatasetDetail> {
  const res = await authedFetch(getToken, `/me/datasets/${encodeURIComponent(slug)}`)
  return res.json() as Promise<DatasetDetail>
}

// ── Admin ──────────────────────────────────────────────────────────────────

export async function listDatasets(getToken: GetToken): Promise<AdminDatasetSummary[]> {
  const res = await authedFetch(getToken, '/admin/datasets')
  return res.json() as Promise<AdminDatasetSummary[]>
}

export async function getDataset(getToken: GetToken, id: string): Promise<DatasetDetail> {
  const res = await authedFetch(getToken, `/admin/datasets/${id}`)
  return res.json() as Promise<DatasetDetail>
}

export async function validateDatasetSql(getToken: GetToken, setupSql: string): Promise<SchemaTable[]> {
  const res = await authedFetch(getToken, '/admin/datasets/validate', {
    method: 'POST',
    body: JSON.stringify({ setupSql }),
  })
  return res.json() as Promise<SchemaTable[]>
}

export async function createDataset(getToken: GetToken, payload: DatasetInput): Promise<DatasetDetail> {
  const res = await authedFetch(getToken, '/admin/datasets', { method: 'POST', body: JSON.stringify(payload) })
  return res.json() as Promise<DatasetDetail>
}

export async function updateDataset(getToken: GetToken, id: string, payload: DatasetInput): Promise<DatasetDetail> {
  const res = await authedFetch(getToken, `/admin/datasets/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
  return res.json() as Promise<DatasetDetail>
}

export async function deleteDataset(getToken: GetToken, id: string): Promise<void> {
  await authedFetch(getToken, `/admin/datasets/${id}`, { method: 'DELETE' })
}

export async function setDatasetCohorts(getToken: GetToken, id: string, cohortIds: string[]): Promise<void> {
  await authedFetch(getToken, `/admin/datasets/${id}/cohorts`, { method: 'PUT', body: JSON.stringify({ cohortIds }) })
}

export async function listCohortOptions(getToken: GetToken): Promise<CohortOption[]> {
  const res = await authedFetch(getToken, '/admin/datasets/cohort-options')
  return res.json() as Promise<CohortOption[]>
}
