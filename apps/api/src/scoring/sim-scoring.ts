/**
 * Scoring for a text simulation (decision, quant and SQL nodes), run on the server for a launched
 * play so a learner cannot post a score of their own.
 *
 * This is the server twin of the browser's `apps/web/src/lib/scoring.ts`: the same rules, kept in
 * sync by `apps/web/src/lib/scoring.parity.test.ts`, which runs both on the same plays. The API
 * is built on its own (Railway builds from `apps/api`), so it cannot import the shared package.
 * Pure: no framework or database imports.
 */

export type Quality = 'strong' | 'proficient' | 'developing'
export type Band = 'ideal' | 'accepted' | 'low' | 'high'

export interface Signal {
  dimension: string
  quality: Quality
}

export interface BandSpec {
  min: number
  max: number
  idealMin?: number
  idealMax?: number
}

export interface QuantField {
  id: string
  acceptedRange: BandSpec
  modelAnswer: number
  derivation?: string
}

export interface SimNode {
  nodeId: string
  type: 'decision' | 'transition' | 'feedback' | 'quant' | 'sql'
  choices?: { id: string; nextNodeId: string; qualitySignals: Signal[] }[]
  nextNodeId?: string
  quant?: {
    variant: 'numeric-range' | 'structured-quant'
    field?: QuantField
    fields?: QuantField[]
    hint?: string
    hintFootnote?: string
  }
  sql?: {
    datasetSlug: string
    referenceSql: string
    ordered?: boolean
    strictColumns?: boolean
    hint?: string
  }
  quantSignalDimensions?: string[]
  sqlSignalDimensions?: string[]
}

export interface SimScenario {
  scenarioId: string
  title: string
  track: string
  nodes: SimNode[]
  rubric: { dimensions: { name: string }[] }
}

export interface QuantFieldResult {
  fieldId: string
  modelAnswer: number
  userAnswer: number
  band: Band
}

export interface DimensionResult {
  dimension: string
  score: number
  quality: Quality
  feedback: string
}

/** What a play has recorded: enough to score it, nothing the client computed. */
export interface Run {
  /** nodeId to the choice picked, in the order played. */
  choices: Record<string, string>
  /** nodeId to the per-field results of the submitted answer. */
  quant: Record<string, QuantFieldResult[]>
  /** nodeId to whether the submitted query matched the reference. */
  sql: Record<string, boolean>
  /** Nodes where the hint was revealed before answering. */
  hints: string[]
}

export const QUALITY_SCORE: Record<Quality, number> = {
  strong: 88,
  proficient: 68,
  developing: 42,
}

/** A dimension with no signals scores 55, which reads as "developing". */
const NO_SIGNAL_SCORE = 55

export function dimensionScore(name: string, signals: Quality[]): DimensionResult {
  const score =
    signals.length > 0
      ? Math.round(signals.reduce((sum, q) => sum + QUALITY_SCORE[q], 0) / signals.length)
      : NO_SIGNAL_SCORE
  const quality: Quality = score >= 80 ? 'strong' : score >= 60 ? 'proficient' : 'developing'
  const feedback: Record<Quality, string> = {
    strong: `You demonstrated strong ${name.toLowerCase()}. Your decisions reflected clear judgment and appropriate calibration to the situation.`,
    proficient: `Your ${name.toLowerCase()} was solid. There were moments where a sharper prioritization would have strengthened your response.`,
    developing: `${name} is an area to develop. Your decisions here suggest an opportunity to build more structured habits around this competency.`,
  }
  return { dimension: name, score, quality, feedback: feedback[quality] }
}

export function classifyAnswer(value: number, band: BandSpec): Band {
  if (band.idealMin !== undefined && band.idealMax !== undefined) {
    if (value >= band.idealMin && value <= band.idealMax) return 'ideal'
  }
  if (value >= band.min && value <= band.max) return 'accepted'
  return value < band.min ? 'low' : 'high'
}

/** Any out-of-band field beats an accepted one, which beats ideal. */
export function worstBand(bands: Band[]): Band {
  const out = bands.find((b) => b === 'low' || b === 'high')
  if (out) return out
  return bands.includes('accepted') ? 'accepted' : 'ideal'
}

export const bandQuality = (band: Band): Quality =>
  band === 'ideal' ? 'strong' : band === 'accepted' ? 'proficient' : 'developing'

/** The node a play starts on: the first decision, quant or sql node, else the first node. */
export function firstNodeId(nodes: SimNode[]): string | undefined {
  return (
    nodes.find((n) => n.type === 'decision' || n.type === 'quant' || n.type === 'sql') ?? nodes[0]
  )?.nodeId
}

export function fieldsOf(node: SimNode): QuantField[] {
  const q = node.quant
  if (!q) return []
  return q.variant === 'numeric-range' ? (q.field ? [q.field] : []) : (q.fields ?? [])
}

/** Classifies a quant answer against each field's band. `values` is keyed by field id. */
export function gradeQuant(node: SimNode, values: Record<string, number>): QuantFieldResult[] {
  return fieldsOf(node).map((f) => ({
    fieldId: f.id,
    modelAnswer: f.modelAnswer,
    userAnswer: values[f.id],
    band: classifyAnswer(values[f.id], f.acceptedRange),
  }))
}

/** Every rubric dimension's score for a run, and the rounded mean of them. */
export function scoreRun(
  scenario: SimScenario,
  run: Run
): { dimensionScores: DimensionResult[]; overallScore: number } {
  const hinted = new Set(run.hints)
  const byDimension: Record<string, Quality[]> = {}
  const push = (dimension: string, quality: Quality) => {
    ;(byDimension[dimension] ??= []).push(quality)
  }
  const node = (id: string) => scenario.nodes.find((n) => n.nodeId === id)

  for (const [nodeId, choiceId] of Object.entries(run.choices)) {
    const choice = node(nodeId)?.choices?.find((c) => c.id === choiceId)
    for (const s of choice?.qualitySignals ?? []) push(s.dimension, s.quality)
  }
  for (const [nodeId, results] of Object.entries(run.quant)) {
    const n = node(nodeId)
    if (!n) continue
    let quality = bandQuality(worstBand(results.map((r) => r.band)))
    // a hint caps the rating at proficient; developing stays developing
    if (hinted.has(nodeId) && quality === 'strong') quality = 'proficient'
    for (const dim of n.quantSignalDimensions ?? ['Quantitative Accuracy']) push(dim, quality)
  }
  for (const [nodeId, correct] of Object.entries(run.sql)) {
    const n = node(nodeId)
    if (!n) continue
    let quality: Quality = correct ? 'strong' : 'developing'
    if (hinted.has(nodeId) && quality === 'strong') quality = 'proficient'
    for (const dim of n.sqlSignalDimensions ?? ['Technical Accuracy']) push(dim, quality)
  }

  const dimensionScores = scenario.rubric.dimensions.map((d) =>
    dimensionScore(d.name, byDimension[d.name] ?? [])
  )
  const overallScore = dimensionScores.length
    ? Math.round(dimensionScores.reduce((sum, d) => sum + d.score, 0) / dimensionScores.length)
    : 0
  return { dimensionScores, overallScore }
}
