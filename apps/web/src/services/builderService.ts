import type { Scenario } from '@id/types'
import { RUBRIC_TEMPLATES } from '@/lib/builderTemplates'

const KEY = 'id-builder-scenarios'

function load(): Scenario[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    return JSON.parse(raw) as Scenario[]
  } catch {
    return []
  }
}

function save(scenarios: Scenario[]): void {
  localStorage.setItem(KEY, JSON.stringify(scenarios))
}

export function listScenarios(): Scenario[] {
  return load()
}

export function getScenario(id: string): Scenario | null {
  return load().find(s => s.scenarioId === id) ?? null
}

export function createScenario(title: string, track: string): Scenario {
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
  save([...load(), scenario])
  return scenario
}

export function updateScenario(scenario: Scenario): void {
  const all = load()
  save(all.map(s =>
    s.scenarioId === scenario.scenarioId
      ? {
          ...scenario,
          builderMeta: {
            ...scenario.builderMeta!,
            lastEditedAt: new Date().toISOString(),
          },
        }
      : s
  ))
}

export function deleteScenario(id: string): void {
  save(load().filter(s => s.scenarioId !== id))
}

export function publishScenario(id: string): void {
  const all = load()
  save(
    all.map(s =>
      s.scenarioId === id
        ? {
            ...s,
            builderMeta: {
              ...s.builderMeta!,
              status: 'published' as const,
              lastEditedAt: new Date().toISOString(),
            },
          }
        : s
    )
  )
}

function autoLayoutPositions(scenario: Scenario): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}
  const nodes = scenario.nodes
  if (!nodes.length) return positions

  // Build children map from node connections
  const children: Record<string, string[]> = {}
  nodes.forEach(n => {
    children[n.nodeId] = []
    if (n.type === 'decision' && n.choices) {
      n.choices.forEach(c => { if (c.nextNodeId) children[n.nodeId].push(c.nextNodeId) })
    }
    if (n.type === 'transition' && n.nextNodeId) {
      children[n.nodeId].push(n.nextNodeId)
    }
  })

  // BFS from first node to assign depth layers
  const firstNodeId = nodes[0].nodeId
  const layers: string[][] = []
  const visited = new Set<string>()
  let queue = [firstNodeId]
  visited.add(firstNodeId)

  while (queue.length > 0) {
    layers.push(queue)
    const next: string[] = []
    queue.forEach(id => {
      ;(children[id] ?? []).forEach(childId => {
        if (!visited.has(childId)) {
          visited.add(childId)
          next.push(childId)
        }
      })
    })
    queue = next
  }

  // Any disconnected nodes go at the end
  nodes.forEach(n => {
    if (!visited.has(n.nodeId)) layers.push([n.nodeId])
  })

  const LAYER_H = 220
  const NODE_W = 300
  const CENTER_X = 400

  // Start placeholder sits above the first real node
  positions[`start-${firstNodeId}`] = { x: CENTER_X, y: 20 }

  layers.forEach((layer, depth) => {
    const totalWidth = (layer.length - 1) * NODE_W
    const startX = CENTER_X - totalWidth / 2
    layer.forEach((nodeId, i) => {
      positions[nodeId] = {
        x: startX + i * NODE_W,
        y: 160 + depth * LAYER_H,
      }
    })
  })

  return positions
}

export function importStaticScenario(scenario: Scenario): Scenario {
  const existing = getScenario(scenario.scenarioId)
  if (existing) return existing
  const imported: Scenario = {
    ...scenario,
    builderMeta: {
      status: 'published',
      lastEditedAt: new Date().toISOString(),
      positions: autoLayoutPositions(scenario),
    },
  }
  save([...load(), imported])
  return imported
}

export function duplicateScenario(id: string): Scenario | null {
  const original = getScenario(id)
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
  save([...load(), copy])
  return copy
}
