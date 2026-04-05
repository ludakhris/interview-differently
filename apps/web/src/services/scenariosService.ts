import { scenarios, trackMeta } from '@/lib/scenarios'
import type { Scenario } from '@id/types'

export type TrackMeta = {
  label: string
  description: string
  color: string
  icon: string
}

export type ScenariosData = {
  scenarios: Scenario[]
  trackMeta: Record<string, TrackMeta>
}

/**
 * Fetches all scenarios and track metadata.
 *
 * Currently reads from the static config in src/lib/scenarios.ts.
 * To switch to the API, replace the body of this function with:
 *
 *   const res = await fetch(`${import.meta.env.VITE_API_URL}/api/scenarios`)
 *   if (!res.ok) throw new Error('Failed to fetch scenarios')
 *   return res.json()
 */
export async function fetchScenarios(): Promise<ScenariosData> {
  return { scenarios, trackMeta }
}

/**
 * Fetches a single scenario by ID.
 *
 * To switch to the API, replace with:
 *   const res = await fetch(`${import.meta.env.VITE_API_URL}/api/scenarios/${id}`)
 *   if (!res.ok) throw new Error('Scenario not found')
 *   return res.json()
 */
export async function fetchScenario(id: string): Promise<Scenario | null> {
  const { scenarios } = await fetchScenarios()
  return scenarios.find((s) => s.scenarioId === id) ?? null
}
