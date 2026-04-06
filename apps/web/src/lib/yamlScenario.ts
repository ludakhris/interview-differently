import jsYaml from 'js-yaml'
import type { Scenario, ScenarioNode, Choice, ScoreQuality } from '@id/types'

// ── YAML schema types ─────────────────────────────────────────────────────────

interface YamlChoice {
  id: 'A' | 'B' | 'C' | 'D'
  text: string
  next: string
  signals?: Record<string, ScoreQuality>
}

interface YamlNode {
  id: string
  type: 'decision' | 'transition' | 'feedback'
  narrative: string
  contextPanels?: { label: string; value: string; type: 'alert' | 'info' | 'metric' }[]
  chart?: Scenario['nodes'][number]['chart']
  choices?: YamlChoice[]
  next?: string
}

interface YamlScenario {
  id: string
  title: string
  track: string
  estimatedMinutes: number
  briefing: {
    situation: string
    role: string
    organisation: string
    reportsTo: string
    timeInRole: string | number
  }
  display?: Scenario['display']
  rubric: { name: string; description: string }[]
  nodes: YamlNode[]
}

// ── YAML string → Scenario ────────────────────────────────────────────────────

export function yamlToScenario(yamlStr: string): Scenario {
  const raw = jsYaml.load(yamlStr) as YamlScenario

  const nodes: ScenarioNode[] = raw.nodes.map(n => {
    const choices: Choice[] | undefined = n.choices?.map(c => ({
      id: c.id,
      text: c.text,
      nextNodeId: c.next ?? '',
      qualitySignals: c.signals
        ? Object.entries(c.signals).map(([dimension, quality]) => ({ dimension, quality }))
        : [],
    }))

    return {
      nodeId: n.id,
      type: n.type,
      narrative: n.narrative,
      ...(n.contextPanels?.length ? { contextPanels: n.contextPanels } : {}),
      ...(n.chart ? { chart: n.chart } : {}),
      ...(choices ? { choices } : {}),
      ...(n.next ? { nextNodeId: n.next } : {}),
    }
  })

  return {
    scenarioId: raw.id,
    title: raw.title,
    track: raw.track as Scenario['track'],
    estimatedMinutes: raw.estimatedMinutes,
    briefing: {
      situation: raw.briefing.situation ?? '',
      role: raw.briefing.role ?? '',
      organisation: raw.briefing.organisation ?? '',
      reportsTo: raw.briefing.reportsTo ?? '',
      timeInRole: String(raw.briefing.timeInRole ?? ''),
    },
    ...(raw.display ? { display: raw.display } : {}),
    rubric: {
      dimensions: raw.rubric.map(d => ({ name: d.name, description: d.description })),
    },
    nodes,
  }
}

// ── Scenario → YAML string ────────────────────────────────────────────────────

export function scenarioToYaml(scenario: Scenario): string {
  const yamlObj = {
    id: scenario.scenarioId,
    title: scenario.title,
    track: scenario.track,
    estimatedMinutes: scenario.estimatedMinutes,
    briefing: scenario.briefing,
    ...(scenario.display ? { display: scenario.display } : {}),
    rubric: scenario.rubric.dimensions,
    nodes: scenario.nodes.map(n => {
      const choices = n.choices?.map(c => ({
        id: c.id,
        text: c.text,
        next: c.nextNodeId,
        ...(c.qualitySignals.length > 0
          ? {
              signals: Object.fromEntries(
                c.qualitySignals.map(s => [s.dimension, s.quality])
              ),
            }
          : {}),
      }))

      return {
        id: n.nodeId,
        type: n.type,
        narrative: n.narrative,
        ...(n.contextPanels?.length ? { contextPanels: n.contextPanels } : {}),
        ...(n.chart ? { chart: n.chart } : {}),
        ...(choices?.length ? { choices } : {}),
        ...(n.nextNodeId ? { next: n.nextNodeId } : {}),
      }
    }),
  }

  return jsYaml.dump(yamlObj, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
  })
}

// ── Download helper ───────────────────────────────────────────────────────────

export function downloadScenarioYaml(scenario: Scenario): void {
  const yaml = scenarioToYaml(scenario)
  const blob = new Blob([yaml], { type: 'text/yaml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${scenario.scenarioId}.yaml`
  a.click()
  URL.revokeObjectURL(url)
}
