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

  const count = await prisma.scenario.count()
  if (count > 0) {
    console.log(`Database already has ${count} scenario(s) — skipping seed.`)
    return
  }

  const scenariosDir = resolve(__dirname, '../../../apps/web/src/lib/scenarios')

  console.log('🌱 Seeding scenarios from YAML files...')

  const yamlFiles = readdirSync(scenariosDir).filter((f) => f.endsWith('.yaml'))

  for (const file of yamlFiles) {
    const yamlStr = readFileSync(join(scenariosDir, file), 'utf-8')
    const scenario = yamlToScenario(yamlStr)

    await prisma.scenario.upsert({
      where: { scenarioId: scenario.scenarioId },
      update: { data: scenario as object, status: 'published' },
      create: {
        scenarioId: scenario.scenarioId,
        status: 'published',
        data: scenario as object,
      },
    })

    console.log(`  ✓ ${scenario.scenarioId} — ${scenario.title}`)
  }

  console.log(`\n✅ Seeded ${yamlFiles.length} scenarios.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
