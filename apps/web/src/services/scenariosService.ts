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

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export async function fetchScenarios(): Promise<ScenariosData> {
  const res = await fetch(`${API_URL}/api/scenarios`)
  if (!res.ok) throw new Error('Failed to fetch scenarios')
  return res.json() as Promise<ScenariosData>
}

export async function fetchScenario(id: string): Promise<Scenario | null> {
  const res = await fetch(`${API_URL}/api/scenarios/${id}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch scenario ${id}`)
  return res.json() as Promise<Scenario>
}
