import type { Scenario } from '@id/types'
import { RUBRIC_TEMPLATES } from '@/lib/builderTemplates'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API error ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function listScenarios(): Promise<Scenario[]> {
  const data = await apiFetch<{ scenarios: Scenario[] }>('/scenarios')
  return data.scenarios
}

export async function getScenario(id: string): Promise<Scenario | null> {
  try {
    return await apiFetch<Scenario>(`/scenarios/${id}`)
  } catch {
    return null
  }
}

export async function createScenario(title: string, track: string): Promise<Scenario> {
  const id = crypto.randomUUID()
  const startNodeId = crypto.randomUUID()
  const scenario: Scenario = {
    scenarioId: id,
    title,
    track: track as Scenario['track'],
    estimatedMinutes: 20,
    briefing: { situation: '', role: '', organisation: '', reportsTo: '', timeInRole: '' },
    nodes: [{ nodeId: startNodeId, type: 'decision', narrative: '' }],
    rubric: { dimensions: RUBRIC_TEMPLATES[track] ?? [] },
    builderMeta: {
      status: 'draft',
      lastEditedAt: new Date().toISOString(),
      positions: { [startNodeId]: { x: 300, y: 100 } },
    },
  }
  return apiFetch<Scenario>('/scenarios', { method: 'POST', body: JSON.stringify(scenario) })
}

export async function updateScenario(scenario: Scenario): Promise<Scenario> {
  return apiFetch<Scenario>(`/scenarios/${scenario.scenarioId}`, {
    method: 'PUT',
    body: JSON.stringify(scenario),
  })
}

export async function deleteScenario(id: string): Promise<void> {
  return apiFetch<void>(`/scenarios/${id}`, { method: 'DELETE' })
}

export async function publishScenario(id: string): Promise<Scenario> {
  return apiFetch<Scenario>(`/scenarios/${id}/publish`, { method: 'PATCH' })
}

export function autoLayoutPositions(scenario: Scenario): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}
  const nodes = scenario.nodes
  if (!nodes.length) return positions

  const children: Record<string, string[]> = {}
  nodes.forEach((n) => {
    children[n.nodeId] = []
    if (n.type === 'decision' && n.choices) {
      n.choices.forEach((c) => {
        if (c.nextNodeId) children[n.nodeId].push(c.nextNodeId)
      })
    }
    if (n.type === 'transition' && n.nextNodeId) {
      children[n.nodeId].push(n.nextNodeId)
    }
  })

  const firstNodeId = nodes[0].nodeId
  const layers: string[][] = []
  const visited = new Set<string>()
  let queue = [firstNodeId]
  visited.add(firstNodeId)

  while (queue.length > 0) {
    layers.push(queue)
    const next: string[] = []
    queue.forEach((id) => {
      ;(children[id] ?? []).forEach((childId) => {
        if (!visited.has(childId)) {
          visited.add(childId)
          next.push(childId)
        }
      })
    })
    queue = next
  }

  nodes.forEach((n) => {
    if (!visited.has(n.nodeId)) layers.push([n.nodeId])
  })

  const LAYER_H = 220
  const NODE_W = 300
  const CENTER_X = 400

  positions[`start-${firstNodeId}`] = { x: CENTER_X, y: 20 }

  layers.forEach((layer, depth) => {
    const totalWidth = (layer.length - 1) * NODE_W
    const startX = CENTER_X - totalWidth / 2
    layer.forEach((nodeId, i) => {
      positions[nodeId] = { x: startX + i * NODE_W, y: 160 + depth * LAYER_H }
    })
  })

  return positions
}

export async function importStaticScenario(scenario: Scenario): Promise<Scenario> {
  // Check if already exists
  const existing = await getScenario(scenario.scenarioId)
  if (existing) return existing
  const imported: Scenario = {
    ...scenario,
    builderMeta: {
      status: 'published',
      lastEditedAt: new Date().toISOString(),
      positions: autoLayoutPositions(scenario),
    },
  }
  return apiFetch<Scenario>('/scenarios', { method: 'POST', body: JSON.stringify(imported) })
}

export async function duplicateScenario(id: string): Promise<Scenario | null> {
  const original = await getScenario(id)
  if (!original) return null
  const copy: Scenario = {
    ...original,
    scenarioId: crypto.randomUUID(),
    title: `${original.title} (copy)`,
    builderMeta: {
      ...original.builderMeta!,
      status: 'draft',
      lastEditedAt: new Date().toISOString(),
    },
  }
  return apiFetch<Scenario>('/scenarios', { method: 'POST', body: JSON.stringify(copy) })
}
