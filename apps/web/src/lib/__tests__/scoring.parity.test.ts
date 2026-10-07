import { describe, expect, it } from 'vitest'
import type { QuantBandHit, QuantFieldResult, Scenario } from '@id/types'
import {
  bandQuality as apiBandQuality,
  classifyAnswer as apiClassify,
  dimensionScore as apiDimensionScore,
  scoreRun as apiScoreRun,
  worstBand as apiWorstBand,
} from '../../../../api/src/scoring/sim-scoring'
import { classifyAnswer } from '../quant/formula'
import {
  bandQuality,
  buildDimensionScore,
  collectSignals,
  scoreDimensions,
  worstBand,
  type Run,
} from '../scoring'

// The server scores a launched play with apps/api/src/scoring/sim-scoring.ts. These tests run it and
// this app's scoring on the same plays, so the two cannot drift apart without a failure here.

const band = { min: 80, max: 120, idealMin: 95, idealMax: 105 }
const q = (dimension: string, quality: 'strong' | 'proficient' | 'developing') => ({
  dimension,
  quality,
})

const scenario = {
  scenarioId: 'S',
  title: 'T',
  track: 'ops',
  rubric: {
    dimensions: [
      { name: 'Judgment' },
      { name: 'Communication' },
      { name: 'Quantitative Accuracy' },
      { name: 'Technical Accuracy' },
      { name: 'Risk' },
    ],
  },
  nodes: [
    {
      nodeId: 'd1',
      type: 'decision',
      choices: [
        {
          id: 'A',
          nextNodeId: 'd2',
          qualitySignals: [q('Judgment', 'strong'), q('Risk', 'proficient')],
        },
        { id: 'B', nextNodeId: 'd2', qualitySignals: [q('Judgment', 'proficient')] },
        {
          id: 'C',
          nextNodeId: 'd2',
          qualitySignals: [q('Judgment', 'developing'), q('Communication', 'developing')],
        },
      ],
    },
    {
      nodeId: 'd2',
      type: 'decision',
      choices: [
        { id: 'A', nextNodeId: 'q1', qualitySignals: [q('Communication', 'strong')] },
        { id: 'B', nextNodeId: 'q1', qualitySignals: [q('Communication', 'developing')] },
      ],
    },
    {
      nodeId: 'q1',
      type: 'quant',
      nextNodeId: 'q2',
      quant: {
        variant: 'numeric-range',
        field: { id: 'f', acceptedRange: band, modelAnswer: 100 },
      },
    },
    {
      nodeId: 'q2',
      type: 'quant',
      nextNodeId: 's1',
      quantSignalDimensions: ['Judgment', 'Risk'],
      quant: {
        variant: 'structured-quant',
        fields: [
          { id: 'a', acceptedRange: band, modelAnswer: 100 },
          { id: 'b', acceptedRange: { min: 1, max: 2 }, modelAnswer: 1.5 },
        ],
      },
    },
    {
      nodeId: 's1',
      type: 'sql',
      nextNodeId: 's2',
      sql: { datasetSlug: 'x', referenceSql: 'select 1' },
    },
    {
      nodeId: 's2',
      type: 'sql',
      nextNodeId: 'end',
      sqlSignalDimensions: ['Technical Accuracy', 'Communication'],
      sql: { datasetSlug: 'x', referenceSql: 'select 2' },
    },
    { nodeId: 'end', type: 'feedback' },
  ],
} as unknown as Scenario

/** Small seeded generator, so a failure reproduces. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const BANDS: QuantBandHit[] = ['ideal', 'accepted', 'low', 'high']

function randomRun(next: () => number): Run {
  const pick = <T>(xs: T[]) => xs[Math.floor(next() * xs.length)]
  const result = (fieldId: string): QuantFieldResult => ({
    fieldId,
    modelAnswer: 100,
    userAnswer: 1,
    band: pick(BANDS),
  })
  const run: Run = { choices: {}, quant: {}, sql: {}, hints: [] }
  if (next() > 0.1) run.choices.d1 = pick(['A', 'B', 'C', 'Z'])
  if (next() > 0.1) run.choices.d2 = pick(['A', 'B'])
  if (next() > 0.15) run.quant.q1 = [result('f')]
  if (next() > 0.15) run.quant.q2 = [result('a'), result('b')]
  if (next() > 0.15) run.sql.s1 = next() > 0.5
  if (next() > 0.15) run.sql.s2 = next() > 0.5
  for (const id of ['q1', 'q2', 's1', 's2']) if (next() > 0.6) run.hints.push(id)
  // answers for nodes that do not exist must be ignored by both
  if (next() > 0.8) run.quant.ghost = [result('x')]
  return run
}

describe('web scoring and the server twin agree', () => {
  it('on every rubric dimension and the overall score, for 500 random plays', () => {
    const next = rng(20261007)
    for (let i = 0; i < 500; i++) {
      const run = randomRun(next)
      const web = scoreDimensions(scenario, collectSignals(scenario, run).signalMap)
      const api = apiScoreRun(scenario as never, run)
      expect(api, JSON.stringify(run)).toEqual(web)
    }
  })

  it('on the band of a typed answer', () => {
    const bands = [band, { min: 1, max: 2 }, { min: 80, max: 120, idealMin: 95 }]
    for (const b of bands)
      for (const v of [
        -5, 0, 0.99, 1, 1.5, 2, 2.01, 79.99, 80, 94.99, 95, 100, 105, 105.01, 120, 120.01, 1e9,
      ])
        expect(apiClassify(v, b), `${v} in ${JSON.stringify(b)}`).toBe(classifyAnswer(v, b))
  })

  it('on the worst of several bands, and the quality of a band', () => {
    const next = rng(7)
    for (let i = 0; i < 200; i++) {
      const bands = Array.from(
        { length: 1 + Math.floor(next() * 4) },
        () => BANDS[Math.floor(next() * 4)]
      )
      expect(apiWorstBand(bands)).toBe(worstBand(bands))
    }
    for (const b of BANDS) expect(apiBandQuality(b)).toBe(bandQuality(b))
  })

  it('on a dimension score and its feedback', () => {
    const lists = [
      [],
      ['strong'],
      ['strong', 'developing'],
      ['proficient', 'proficient', 'developing'],
    ] as const
    for (const name of ['Judgment', 'Risk Judgment'])
      for (const signals of lists)
        expect(apiDimensionScore(name, [...signals])).toEqual(
          buildDimensionScore(name, [...signals])
        )
  })
})
