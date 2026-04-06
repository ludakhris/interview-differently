import { scenarios, trackMeta } from '@/lib/scenarios'
import { listScenarios } from '@/services/builderService'
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
  const builderScenarios = listScenarios().filter(s => s.builderMeta?.status === 'published')
  const builderIds = new Set(builderScenarios.map(s => s.scenarioId))
  // If a static scenario has been imported to the builder, use the builder version
  const staticScenarios = scenarios.filter(s => !builderIds.has(s.scenarioId))
  return { scenarios: [...staticScenarios, ...builderScenarios], trackMeta }
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
  // Prefer builder version — it may be an edited copy of a static scenario
  const builderVersion = listScenarios().find((s) => s.scenarioId === id)
  if (builderVersion) return builderVersion
  return scenarios.find((s) => s.scenarioId === id) ?? null
}
