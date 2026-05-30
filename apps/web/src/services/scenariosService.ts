import type { Scenario } from '@id/types'

export type TrackMeta = {
  label: string
  description: string
  color: string
  icon: string
}

export type ScenariosData = {
  // Backend returns the *summary* shape for the listing — only the fields
  // dashboard cards need. We still type it as Scenario[] for simplicity;
  // nodes/exhibits/phases/rubric are intentionally absent.
  scenarios: Scenario[]
  trackMeta: Record<string, TrackMeta>
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export async function fetchScenarios(): Promise<ScenariosData> {
  const res = await fetch(`${API_URL}/api/scenarios`)
  if (!res.ok) throw new Error('Failed to fetch scenarios')
  return res.json() as Promise<ScenariosData>
}

/**
 * Fetch a single scenario. When `getToken` is provided and resolves to a
 * non-null Clerk JWT, we send it as a Bearer header and the backend
 * returns the *full* scenario body (nodes, exhibits, quant answers).
 * Without a token (or for guests) the backend returns the summary form —
 * enough to render the briefing page but not the simulation itself.
 */
export async function fetchScenario(
  id: string,
  getToken?: () => Promise<string | null>,
): Promise<Scenario | null> {
  const headers: HeadersInit = {}
  if (getToken) {
    const token = await getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(`${API_URL}/api/scenarios/${id}`, { headers })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch scenario ${id}`)
  return res.json() as Promise<Scenario>
}
