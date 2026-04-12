import { PrismaClient } from '@prisma/client'
import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import * as yaml from 'js-yaml'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scenario = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScenarioNode = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Choice = any

const prisma = new PrismaClient()

type ScoreQuality = 'strong' | 'proficient' | 'developing'

interface YamlChoice {
  id: string
  text: string
  next: string
  signals: Record<string, ScoreQuality>
}

interface YamlNode {
  id: string
  type: 'decision' | 'transition' | 'feedback'
  narrative: string
  choices?: YamlChoice[]
  next?: string
  contextPanels?: unknown[]
  chart?: unknown
  audioScript?: string
  responsePrompt?: string
}

interface YamlScenario {
  id: string
  title: string
  track: string
  estimatedMinutes: number
  mode?: 'text' | 'immersive'
  briefing: {
    situation: string
    role: string
    organisation: string
    reportsTo: string
    timeInRole: string | number
  }
  display?: unknown
  rubric: Array<{ name: string; description: string }>
  nodes: YamlNode[]
}

function yamlToScenario(yamlStr: string): Scenario {
  const raw = yaml.load(yamlStr) as YamlScenario

  const nodes: ScenarioNode[] = raw.nodes.map((n) => {
    const base = {
      nodeId: n.id,
      type: n.type,
      narrative: n.narrative ?? '',
    } as ScenarioNode

    if (n.contextPanels) Object.assign(base, { contextPanels: n.contextPanels })
    if (n.chart) Object.assign(base, { chart: n.chart })
    if (n.audioScript) Object.assign(base, { audioScript: n.audioScript })
    if (n.responsePrompt) Object.assign(base, { responsePrompt: n.responsePrompt })

    if (n.type === 'decision' && n.choices) {
      const choices: Choice[] = n.choices.map((c) => ({
        id: c.id as 'A' | 'B' | 'C' | 'D',
        text: c.text,
        nextNodeId: c.next,
        qualitySignals: Object.entries(c.signals ?? {}).map(([dimension, quality]) => ({
          dimension,
          quality,
        })),
      }))
      Object.assign(base, { choices })
    }

    if (n.type === 'transition' && n.next) {
      Object.assign(base, { nextNodeId: n.next })
    }

    return base
  })

  const scenario: Scenario = {
    scenarioId: raw.id,
    title: raw.title,
    track: raw.track as Scenario['track'],
    estimatedMinutes: raw.estimatedMinutes,
    ...(raw.mode ? { mode: raw.mode } : {}),
    briefing: {
      situation: raw.briefing.situation,
      role: raw.briefing.role,
      organisation: raw.briefing.organisation,
      reportsTo: raw.briefing.reportsTo,
      timeInRole: String(raw.briefing.timeInRole),
    },
    nodes,
    rubric: { dimensions: raw.rubric.map((d) => ({ name: d.name, description: d.description })) },
    builderMeta: {
      status: 'published',
      lastEditedAt: new Date().toISOString(),
      positions: {},
    },
  }

  if (raw.display) {
    scenario.display = raw.display as Scenario['display']
  }

  return scenario
}

async function main() {
  // Upsert platform config defaults
  await prisma.platformConfig.upsert({
    where: { key: 'ai_feedback_enabled' },
    update: {},
    create: { key: 'ai_feedback_enabled', value: 'true' },
  })
  console.log('✓ Platform config seeded.')

  const scenariosDir = resolve(__dirname, '../../../apps/web/src/lib/scenarios')

  console.log('🌱 Seeding scenarios from YAML files...')

  const yamlFiles = readdirSync(scenariosDir).filter((f) => f.endsWith('.yaml'))

  let seeded = 0
  for (const file of yamlFiles) {
    const yamlStr = readFileSync(join(scenariosDir, file), 'utf-8')
    const scenario = yamlToScenario(yamlStr)

    const existing = await prisma.scenario.findUnique({ where: { scenarioId: scenario.scenarioId } })
    if (existing) {
      console.log(`  — ${scenario.scenarioId} already exists, skipping.`)
      continue
    }

    await prisma.scenario.create({
      data: {
        scenarioId: scenario.scenarioId,
        status: 'published',
        data: scenario as object,
      },
    })

    console.log(`  ✓ ${scenario.scenarioId} — ${scenario.title}`)
    seeded++
  }

  console.log(`\n✅ Done. ${seeded} new scenario(s) seeded.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
