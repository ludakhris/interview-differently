// Scoring rules for a text simulation: quality signals to dimension scores to an overall score.
//
// The browser still scores a simulation played on the Interview Differently site (the learner's own
// practice). A launched play (LTI) is scored on the server instead, with the twin of this file,
// apps/api/src/scoring/sim-scoring.ts. Keep them in sync: scoring.parity.test.ts runs both on the
// same plays and fails if they ever differ.

import type {
  DimensionScore,
  QuantBandHit,
  QuantFieldResult,
  QualitySignal,
  Scenario,
  ScoreQuality,
} from '@id/types'

export const qualityToScore: Record<ScoreQuality, number> = {
  strong: 88,
  proficient: 68,
  developing: 42,
}

// Build a DimensionScore from a list of quality signals collected for the
// dimension. Shared by overall + per-phase aggregations so both render with
// the same feedback voice.
export function buildDimensionScore(name: string, signals: ScoreQuality[]): DimensionScore {
  const avgScore =
    signals.length > 0
      ? Math.round(signals.reduce((sum, q) => sum + qualityToScore[q], 0) / signals.length)
      : 55
  const quality: ScoreQuality =
    avgScore >= 80 ? 'strong' : avgScore >= 60 ? 'proficient' : 'developing'
  const feedbackMap: Record<ScoreQuality, string> = {
    strong: `You demonstrated strong ${name.toLowerCase()}. Your decisions reflected clear judgment and appropriate calibration to the situation.`,
    proficient: `Your ${name.toLowerCase()} was solid. There were moments where a sharper prioritization would have strengthened your response.`,
    developing: `${name} is an area to develop. Your decisions here suggest an opportunity to build more structured habits around this competency.`,
  }
  return { dimension: name, score: avgScore, quality, feedback: feedbackMap[quality] }
}

// Coarse "worst" classifier across a list of band hits: any out-of-band trumps
// accepted, any accepted trumps ideal.
export function worstBand(bands: QuantBandHit[]): QuantBandHit {
  const out = bands.find((b) => b === 'low' || b === 'high')
  if (out) return out
  return bands.includes('accepted') ? 'accepted' : 'ideal'
}

export const bandQuality = (band: QuantBandHit): ScoreQuality =>
  band === 'ideal' ? 'strong' : band === 'accepted' ? 'proficient' : 'developing'

export function signalsFromBand(band: QuantBandHit, dimensions: string[]): QualitySignal[] {
  const quality = bandQuality(band)
  return dimensions.map((dimension) => ({ dimension, quality }))
}

/** What a play has recorded: enough to score it. */
export interface Run {
  /** nodeId to the choice picked. */
  choices: Record<string, string>
  /** nodeId to the per-field results of the submitted answer. */
  quant: Record<string, QuantFieldResult[]>
  /** nodeId to whether the submitted query matched the reference. */
  sql: Record<string, boolean>
  /** Nodes where the hint was revealed before answering. */
  hints: string[]
}

/**
 * Every quality signal a run produced, by rubric dimension and by the node it came from (the
 * per-phase breakdown re-aggregates the second).
 */
export function collectSignals(scenario: Scenario, run: Run) {
  const signalMap: Record<string, ScoreQuality[]> = {}
  const nodeSignals: Record<string, QualitySignal[]> = {}
  function push(nodeId: string, sig: QualitySignal) {
    ;(signalMap[sig.dimension] ??= []).push(sig.quality)
    ;(nodeSignals[nodeId] ??= []).push(sig)
  }
  const hinted = new Set(run.hints)

  for (const [nodeId, choiceId] of Object.entries(run.choices)) {
    const choice = scenario.nodes
      .find((n) => n.nodeId === nodeId)
      ?.choices?.find((c) => c.id === choiceId)
    for (const signal of choice?.qualitySignals ?? []) push(nodeId, signal)
  }
  for (const [nodeId, results] of Object.entries(run.quant)) {
    const node = scenario.nodes.find((n) => n.nodeId === nodeId)
    if (!node) continue
    let quality = bandQuality(worstBand(results.map((r) => r.band)))
    // Hint dock: a candidate who needed help cannot earn Strong; capped at proficient.
    if (hinted.has(nodeId) && quality === 'strong') quality = 'proficient'
    for (const dimension of node.quantSignalDimensions ?? ['Quantitative Accuracy'])
      push(nodeId, { dimension, quality })
  }
  for (const [nodeId, correct] of Object.entries(run.sql)) {
    const node = scenario.nodes.find((n) => n.nodeId === nodeId)
    if (!node) continue
    let quality: ScoreQuality = correct ? 'strong' : 'developing'
    if (hinted.has(nodeId) && quality === 'strong') quality = 'proficient'
    for (const dimension of node.sqlSignalDimensions ?? ['Technical Accuracy'])
      push(nodeId, { dimension, quality })
  }
  return { signalMap, nodeSignals }
}

/** Every rubric dimension's score, and the rounded mean of them. */
export function scoreDimensions(
  scenario: Scenario,
  signalMap: Record<string, ScoreQuality[]>
): { dimensionScores: DimensionScore[]; overallScore: number } {
  const dimensionScores = scenario.rubric.dimensions.map((dim) =>
    buildDimensionScore(dim.name, signalMap[dim.name] ?? [])
  )
  const overallScore = Math.round(
    dimensionScores.reduce((sum, d) => sum + d.score, 0) / dimensionScores.length
  )
  return { dimensionScores, overallScore }
}
