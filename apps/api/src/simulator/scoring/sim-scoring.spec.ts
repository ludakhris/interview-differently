import {
  bandQuality,
  classifyAnswer,
  dimensionScore,
  firstNodeId,
  gradeQuant,
  scoreRun,
  worstBand,
  type SimNode,
  type SimScenario,
} from './sim-scoring'

const band = { min: 80, max: 120, idealMin: 95, idealMax: 105 }

describe('classifyAnswer', () => {
  it.each([
    [100, 'ideal'],
    [95, 'ideal'],
    [105, 'ideal'],
    [85, 'accepted'],
    [80, 'accepted'],
    [120, 'accepted'],
    [79.9, 'low'],
    [120.1, 'high'],
  ])('puts %p in %p', (v, expected) => expect(classifyAnswer(v, band)).toBe(expected))

  it('has no ideal band when only part of it is given', () => {
    expect(classifyAnswer(100, { min: 80, max: 120, idealMin: 95 })).toBe('accepted')
  })
})

describe('worstBand', () => {
  it('ranks out of band over accepted over ideal', () => {
    expect(worstBand(['ideal', 'ideal'])).toBe('ideal')
    expect(worstBand(['ideal', 'accepted'])).toBe('accepted')
    expect(worstBand(['accepted', 'low', 'ideal'])).toBe('low')
    expect(worstBand(['high', 'low'])).toBe('high')
  })
  it('maps to a quality', () => {
    expect(['ideal', 'accepted', 'low', 'high'].map((b) => bandQuality(b as never))).toEqual([
      'strong',
      'proficient',
      'developing',
      'developing',
    ])
  })
})

describe('dimensionScore', () => {
  it('averages the signals and names the quality', () => {
    expect(dimensionScore('Clarity', ['strong', 'proficient'])).toMatchObject({
      score: 78,
      quality: 'proficient',
    })
    expect(dimensionScore('Clarity', ['strong', 'strong'])).toMatchObject({
      score: 88,
      quality: 'strong',
    })
    expect(dimensionScore('Clarity', ['developing'])).toMatchObject({
      score: 42,
      quality: 'developing',
    })
  })
  it('scores a dimension with no signals 55, which reads as developing', () => {
    expect(dimensionScore('Clarity', [])).toMatchObject({ score: 55, quality: 'developing' })
  })
  it('names the dimension in its feedback', () => {
    expect(dimensionScore('Risk Judgment', ['strong']).feedback).toContain('risk judgment')
  })
})

const scenario: SimScenario = {
  scenarioId: 'S',
  title: 'T',
  track: 'ops',
  rubric: {
    dimensions: [
      { name: 'Judgment' },
      { name: 'Quantitative Accuracy' },
      { name: 'Technical Accuracy' },
    ],
  },
  nodes: [
    {
      nodeId: 'd1',
      type: 'decision',
      choices: [
        {
          id: 'A',
          nextNodeId: 'q1',
          qualitySignals: [{ dimension: 'Judgment', quality: 'strong' }],
        },
        {
          id: 'B',
          nextNodeId: 'q1',
          qualitySignals: [{ dimension: 'Judgment', quality: 'developing' }],
        },
      ],
    },
    {
      nodeId: 'q1',
      type: 'quant',
      nextNodeId: 's1',
      quant: {
        variant: 'numeric-range',
        field: { id: 'f', acceptedRange: band, modelAnswer: 100 },
      },
    },
    {
      nodeId: 's1',
      type: 'sql',
      nextNodeId: 'end',
      sql: { datasetSlug: 'x', referenceSql: 'select 1' },
    },
    { nodeId: 'end', type: 'feedback' },
  ],
}

const quantRun = (v: number) => ({ q1: gradeQuant(scenario.nodes[1], { f: v }) })

describe('scoreRun', () => {
  it('scores a perfect play', () => {
    const out = scoreRun(scenario, {
      choices: { d1: 'A' },
      quant: quantRun(100),
      sql: { s1: true },
      hints: [],
    })
    expect(out.dimensionScores.map((d) => [d.dimension, d.score])).toEqual([
      ['Judgment', 88],
      ['Quantitative Accuracy', 88],
      ['Technical Accuracy', 88],
    ])
    expect(out.overallScore).toBe(88)
  })

  it('scores a weak play lower', () => {
    const out = scoreRun(scenario, {
      choices: { d1: 'B' },
      quant: quantRun(10),
      sql: { s1: false },
      hints: [],
    })
    expect(out.overallScore).toBe(42)
  })

  it('caps a strong answer at proficient when the hint was used, and leaves a weak one alone', () => {
    const hinted = scoreRun(scenario, {
      choices: { d1: 'A' },
      quant: quantRun(100),
      sql: { s1: true },
      hints: ['q1', 's1'],
    })
    expect(hinted.dimensionScores.map((d) => d.score)).toEqual([88, 68, 68])
    const weak = scoreRun(scenario, {
      choices: { d1: 'A' },
      quant: quantRun(10),
      sql: { s1: false },
      hints: ['q1', 's1'],
    })
    expect(weak.dimensionScores.map((d) => d.score)).toEqual([88, 42, 42])
  })

  it('scores an unanswered dimension 55 and ignores answers for unknown nodes or choices', () => {
    const out = scoreRun(scenario, {
      choices: { d1: 'Z', ghost: 'A' },
      quant: { ghost: [] },
      sql: { ghost: true },
      hints: [],
    })
    expect(out.dimensionScores.map((d) => d.score)).toEqual([55, 55, 55])
    expect(out.overallScore).toBe(55)
  })

  it('uses the signal dimensions a node names', () => {
    const custom: SimScenario = {
      ...scenario,
      nodes: scenario.nodes.map((n) =>
        n.nodeId === 'q1' ? { ...n, quantSignalDimensions: ['Judgment'] } : n
      ),
    }
    const out = scoreRun(custom, { choices: { d1: 'B' }, quant: quantRun(100), sql: {}, hints: [] })
    // Judgment gets developing (42) and strong (88): mean 65
    expect(out.dimensionScores[0].score).toBe(65)
    expect(out.dimensionScores[1].score).toBe(55)
  })
})

describe('gradeQuant', () => {
  it('grades each field of a structured answer', () => {
    const node: SimNode = {
      nodeId: 'q',
      type: 'quant',
      quant: {
        variant: 'structured-quant',
        fields: [
          { id: 'a', acceptedRange: band, modelAnswer: 100 },
          { id: 'b', acceptedRange: { min: 1, max: 2 }, modelAnswer: 1.5 },
        ],
      },
    }
    expect(gradeQuant(node, { a: 100, b: 9 })).toEqual([
      { fieldId: 'a', modelAnswer: 100, userAnswer: 100, band: 'ideal' },
      { fieldId: 'b', modelAnswer: 1.5, userAnswer: 9, band: 'high' },
    ])
  })
})

describe('firstNodeId', () => {
  it('starts on the first decision, quant or sql node', () => {
    expect(firstNodeId([{ nodeId: 't', type: 'transition' }, ...scenario.nodes])).toBe('d1')
  })
  it('falls back to the first node, and to nothing for none', () => {
    expect(firstNodeId([{ nodeId: 't', type: 'transition' }])).toBe('t')
    expect(firstNodeId([])).toBeUndefined()
  })
})
