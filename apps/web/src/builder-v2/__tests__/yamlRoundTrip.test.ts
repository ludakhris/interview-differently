// Every seeded scenario must survive YAML → Scenario → YAML → Scenario
// unchanged, and pass the v2 validator with no errors. Covers all block
// kinds the seeds use (text/data-table/profit-tree/chart/seg-matrix
// exhibits, decision/transition/feedback/quant/sql nodes, phases,
// immersive persona + audio scripts).

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { yamlToScenario, scenarioToYaml } from '@/lib/yamlScenario'
import { validateScenarioDoc } from '../validate'

const dir = join(__dirname, '../../lib/scenarios')
const files = readdirSync(dir).filter(f => f.endsWith('.yaml'))

describe('YAML round-trip', () => {
  it.each(files)('%s is stable across export → import', (file) => {
    const first = yamlToScenario(readFileSync(join(dir, file), 'utf8'))
    const second = yamlToScenario(scenarioToYaml(first))
    expect(second).toEqual(first)
  })

  it.each(files)('%s has no blocking validation issues', (file) => {
    const scenario = yamlToScenario(readFileSync(join(dir, file), 'utf8'))
    // Immersive seeds need rendered media, which only exists on the server — stub a ready asset per decision.
    const assets = scenario.mode === 'immersive'
      ? scenario.nodes.filter(n => n.type === 'decision').map(n => ({ nodeId: n.nodeId, scenarioId: scenario.scenarioId, status: 'ready' as const, mediaUrl: 'x', scriptHash: '', renderedAt: '' }))
      : []
    const errors = validateScenarioDoc(scenario, assets as never).filter(i => i.level === 'error')
    expect(errors.map(e => e.message)).toEqual([])
  })
})
