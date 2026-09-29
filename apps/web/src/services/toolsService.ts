/**
 * Frontend client for cohort tool flags (#25).
 *
 * `/admin/cohorts/:id/tools` sits behind AdminGuard; `/me/tools` behind
 * AuthenticatedGuard. Both take `getToken` from `useAuth()`.
 */
import type { ToolKey } from '@id/types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export type GetToken = () => Promise<string | null>

export interface CohortToolState {
  toolKey: ToolKey
  enabled: boolean
}

async function authedFetch(
  getToken: GetToken,
  path: string,
  init: RequestInit = {}
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
      if (body.message)
        message = Array.isArray(body.message) ? body.message.join(', ') : body.message
    } catch {
      // not json — keep status text
    }
    throw new Error(message)
  }
  return res
}

export async function fetchMyTools(getToken: GetToken): Promise<ToolKey[]> {
  const res = await authedFetch(getToken, '/me/tools')
  return res.json() as Promise<ToolKey[]>
}

export async function listCohortTools(
  getToken: GetToken,
  cohortId: string
): Promise<CohortToolState[]> {
  const res = await authedFetch(getToken, `/admin/cohorts/${cohortId}/tools`)
  return res.json() as Promise<CohortToolState[]>
}

export async function setCohortTool(
  getToken: GetToken,
  cohortId: string,
  toolKey: ToolKey,
  enabled: boolean
): Promise<void> {
  await authedFetch(getToken, `/admin/cohorts/${cohortId}/tools/${toolKey}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

// ── SQL sandbox activity (query log) ───────────────────────────────────────

export interface SandboxQueryEvent {
  datasetSlug: string
  queryText: string
  ok: boolean
  errorMessage?: string
  rowCount?: number
  durationMs?: number
}

/**
 * Fire-and-forget: monitoring must never break or slow the sandbox.
 * `keepalive` lets the request survive a tab close/navigation; one delayed
 * retry (fresh token) covers an expired token or a network blip.
 */
export function logSandboxQuery(getToken: GetToken, event: SandboxQueryEvent): void {
  const send = () =>
    authedFetch(getToken, '/me/tools/sandbox-queries', {
      method: 'POST',
      body: JSON.stringify(event),
      keepalive: true,
    })
  send().catch(() => {
    setTimeout(() => send().catch(() => {}), 3000)
  })
}

export interface SandboxStudent {
  userId: string
  name: string
  email: string | null
  queryCount: number
  errorCount: number
  lastQueryAt: string | null
  queries: Array<{
    id: string
    datasetSlug: string
    queryText: string
    ok: boolean
    errorMessage: string | null
    rowCount: number | null
    durationMs: number | null
    createdAt: string
  }>
}

export interface SandboxActivity {
  cohort: { id: string; name: string }
  retentionDays: number
  generatedAt: string
  students: SandboxStudent[]
  /** Institution members with no cohort who have run queries. */
  unassigned: SandboxStudent[]
}

export async function fetchSandboxActivity(
  getToken: GetToken,
  cohortId: string
): Promise<SandboxActivity> {
  const res = await authedFetch(getToken, `/admin/cohorts/${cohortId}/sandbox-activity`)
  return res.json() as Promise<SandboxActivity>
}
