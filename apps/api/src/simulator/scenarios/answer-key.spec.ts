import { withholdAnswerKey } from './answer-key'

const scenario = {
  scenarioId: 'S',
  title: 'T',
  rubric: { dimensions: [{ name: 'Judgment', description: 'd' }] },
  nodes: [
    {
      nodeId: 'd1',
      type: 'decision',
      narrative: 'What do you do?',
      choices: [
        {
          id: 'A',
          text: 'Escalate',
          nextNodeId: 'q1',
          qualitySignals: [{ dimension: 'Judgment', quality: 'strong' }],
        },
        {
          id: 'B',
          text: 'Wait',
          nextNodeId: 'q1',
          qualitySignals: [{ dimension: 'Judgment', quality: 'developing' }],
        },
      ],
    },
    {
      nodeId: 'q1',
      type: 'quant',
      narrative: 'Size it',
      nextNodeId: 's1',
      quantSignalDimensions: ['Judgment'],
      quant: {
        variant: 'numeric-range',
        prompt: 'How many?',
        hint: 'multiply families by cost',
        hintFootnote: 'TAM = total market',
        formula: { expression: '{a}*2', variables: [{ name: 'a', label: 'A' }] },
        field: {
          id: 'f',
          label: 'Families',
          unit: 'k',
          acceptedRange: { min: 80, max: 120, idealMin: 95, idealMax: 105 },
          modelAnswer: 4242,
          derivation: 'because 4242',
        },
      },
    },
    {
      nodeId: 'q2',
      type: 'quant',
      narrative: 'More',
      quant: {
        variant: 'structured-quant',
        prompt: 'Two numbers',
        fields: [
          {
            id: 'a',
            label: 'A',
            acceptedRange: { min: 1, max: 2 },
            modelAnswer: 7777,
            derivation: 'x',
          },
          { id: 'b', label: 'B', acceptedRange: { min: 3, max: 4 }, modelAnswer: 8888 },
        ],
      },
    },
    {
      nodeId: 's1',
      type: 'sql',
      narrative: 'Query',
      sql: {
        prompt: 'Top customers',
        datasetSlug: 'sql-fundamentals',
        referenceSql: 'select secret_answer from t',
        ordered: true,
        hint: 'use group by',
      },
    },
    { nodeId: 'end', type: 'feedback', narrative: 'Done' },
  ],
}

describe('withholdAnswerKey', () => {
  const out = withholdAnswerKey(scenario)
  const json = JSON.stringify(out)

  it('leaves none of the answer key in what is sent', () => {
    for (const secret of [
      'strong',
      '4242',
      '7777',
      '8888',
      'because 4242',
      'secret_answer',
      'multiply families by cost',
      'TAM = total market',
      'use group by',
      'idealMin',
    ])
      expect(json).not.toContain(secret)
  })

  it('keeps what the player draws and the learner may see', () => {
    const d1 = out.nodes[0] as (typeof scenario.nodes)[0]
    expect(d1.choices!.map((c) => [c.id, c.text, c.nextNodeId, c.qualitySignals])).toEqual([
      ['A', 'Escalate', 'q1', []],
      ['B', 'Wait', 'q1', []],
    ])
    const q1 = out.nodes[1] as (typeof scenario.nodes)[1]
    expect(q1.quant).toMatchObject({
      prompt: 'How many?',
      formula: scenario.nodes[1].quant!.formula,
      field: { id: 'f', label: 'Families', unit: 'k' },
      hasHint: true,
    })
    expect(q1.quantSignalDimensions).toEqual(['Judgment'])
    const s1 = out.nodes[3] as (typeof scenario.nodes)[3]
    expect(s1.sql).toMatchObject({
      prompt: 'Top customers',
      datasetSlug: 'sql-fundamentals',
      ordered: true,
      hasHint: true,
    })
    expect(out.rubric).toEqual(scenario.rubric)
    expect(out.nodes[4]).toEqual(scenario.nodes[4])
  })

  it('keeps the shape the player expects, with placeholders for the withheld numbers', () => {
    const q2 = out.nodes[2] as (typeof scenario.nodes)[2]
    expect(q2.quant!.fields!.map((f) => [f.id, f.acceptedRange, f.modelAnswer])).toEqual([
      ['a', { min: 0, max: 0 }, 0],
      ['b', { min: 0, max: 0 }, 0],
    ])
    expect(JSON.stringify(q2.quant)).not.toContain('hasHint')
  })

  it('does not change the scenario it was given', () => {
    expect(JSON.stringify(scenario)).toContain('4242')
    expect(scenario.nodes[0].choices![0].qualitySignals).toHaveLength(1)
  })

  it('passes a scenario without nodes through', () => {
    const summary = { scenarioId: 'S', title: 'T' }
    expect(withholdAnswerKey(summary)).toBe(summary)
  })
})
