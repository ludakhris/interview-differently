import { describe, expect, it } from 'vitest'
import type { Scenario } from '@id/types'
import { validateScenarioDoc, hasBlockingIssues } from '../validate'

function base(): Scenario {
  return {
    scenarioId: 's1',
    title: 'T',
    track: 'data-analytics',
    estimatedMinutes: 10,
    briefing: { situation: 'S', role: 'R', organisation: '', reportsTo: '', timeInRole: '' },
    rubric: { dimensions: [{ name: 'Judgment', description: '' }] },
    phases: [{ id: 'p1', label: 'Phase', nodeIds: ['d1', 'e1'] }],
    nodes: [
      {
        nodeId: 'd1',
        type: 'decision',
        narrative: 'Pick one',
        choices: [
          { id: 'A', text: 'Yes', nextNodeId: '', qualitySignals: [{ dimension: 'Judgment', quality: 'strong' }] },
          { id: 'B', text: 'No', nextNodeId: '', qualitySignals: [] },
        ],
      },
      { nodeId: 'e1', type: 'feedback', narrative: 'Done' },
    ],
  }
}

const messages = (s: Scenario) => validateScenarioDoc(s).map(i => `${i.level}:${i.message}`)

describe('validateScenarioDoc', () => {
  it('passes a minimal complete scenario', () => {
    expect(validateScenarioDoc(base())).toEqual([])
  })

  it('an option with no target is fine (continues), a dangling target is not', () => {
    const s = base()
    s.nodes[0].choices![1].nextNodeId = 'ghost'
    const m = messages(s)
    expect(m).toHaveLength(1)
    expect(m[0]).toMatch(/error:.*option B points at a block that was deleted/)
  })

  it('flags setup gaps and points them at the setup block', () => {
    const s = base()
    s.briefing.situation = ''
    s.rubric.dimensions = []
    const issues = validateScenarioDoc(s)
    expect(issues.every(i => i.where?.kind === 'setup')).toBe(true)
    expect(issues.map(i => i.message)).toEqual([
      'The briefing needs a situation — it is the first thing the candidate reads.',
      'Add at least one rubric dimension — scoring has nothing to measure.',
    ])
  })

  it('checks quant bands, model answers, and formula variables', () => {
    const s = base()
    s.phases![0].nodeIds.push('q1')
    s.nodes.push({
      nodeId: 'q1',
      type: 'quant',
      narrative: '',
      quant: {
        variant: 'numeric-range',
        prompt: 'How many?',
        field: { id: 'n', label: 'Count', acceptedRange: { min: 10, max: 5, idealMin: 20, idealMax: 30 }, modelAnswer: 100 },
        formula: { expression: '{a} * {b}', variables: [{ name: 'a', label: 'A', source: { nodeId: 'gone' } }] },
      },
    })
    const m = messages(s)
    expect(m.some(x => /accepted range must run low to high/.test(x))).toBe(true)
    expect(m.some(x => /model answer sits outside/.test(x))).toBe(true)
    expect(m.some(x => /ideal band must sit inside/.test(x))).toBe(true)
    expect(m.some(x => /formula uses "b" but no such variable/.test(x))).toBe(true)
    expect(m.some(x => /carries forward from a question that was deleted/.test(x))).toBe(true)
  })

  it('sql questions need a prompt, dataset, and reference query', () => {
    const s = base()
    s.phases![0].nodeIds.push('sql1')
    s.nodes.push({ nodeId: 'sql1', type: 'sql', narrative: '', sql: { prompt: '', datasetSlug: '', referenceSql: '' } })
    const m = messages(s).filter(x => x.includes('SQL question'))
    expect(m).toHaveLength(3)
  })

  it('warns (not errors) about unreachable blocks and unplaced exhibits', () => {
    const s = base()
    s.nodes.push({ nodeId: 'orphan', type: 'transition', narrative: 'Back', nextNodeId: 'd1' })
    s.exhibits = [{ id: 'x1', kind: 'text-exhibit', title: 'Memo', blocks: [] } as never]
    const issues = validateScenarioDoc(s)
    expect(issues.map(i => i.level)).toEqual(['warning', 'warning'])
    expect(hasBlockingIssues(issues)).toBe(false)
  })

  it('immersive: needs a persona and a ready render per decision, no options required', () => {
    const s = base()
    s.mode = 'immersive'
    s.nodes[0].choices = []
    s.nodes[0].audioScript = 'Hello'
    const m = messages(s)
    expect(m).toEqual([
      'error:Immersive scenarios need an interviewer persona.',
      'error:Decision "Pick one": render the interviewer clip before publishing.',
    ])
  })
})
