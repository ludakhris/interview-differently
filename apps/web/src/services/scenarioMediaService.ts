import type { ScenarioMediaAsset } from '@id/types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export async function listScenarioMedia(scenarioId: string): Promise<ScenarioMediaAsset[]> {
  const res = await fetch(`${API_URL}/api/scenario-media/${scenarioId}`)
  if (!res.ok) throw new Error(`Failed to load media assets: ${res.status}`)
  return res.json()
}

export async function renderNodeMedia(scenarioId: string, nodeId: string): Promise<ScenarioMediaAsset> {
  const res = await fetch(`${API_URL}/api/scenario-media/render/${scenarioId}/${nodeId}`, {
    method: 'POST',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Render failed: ${res.status}`)
  }
  return res.json()
}

export async function deleteNodeMedia(scenarioId: string, nodeId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/scenario-media/${scenarioId}/${nodeId}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Delete failed: ${res.status}`)
  }
}

/** Compute sha256 of a string and return hex. Used for stale detection in the builder UI. */
export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
