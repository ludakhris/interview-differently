import { useState, useCallback, useMemo } from 'react'
import { useAuth } from '@clerk/clerk-react'
import type {
  Scenario,
  ScenarioResult,
  DimensionScore,
  ScoreQuality,
  QualitySignal,
  QuantAnswer,
  QuantFieldResult,
  QuantNodeResultSummary,
  PhaseScore,
} from '@id/types'
import { getPhaseForNode } from '@/lib/phases'

interface SimulationState {
  currentNodeId: string
  choicesMade: Record<string, string>
  // Numeric answers submitted at quant nodes. Keyed by nodeId.
  quantAnswers: Record<string, QuantAnswer>
  // Per-node grading classifications + the (model, user) numbers, used for
  // results page derivation panels later.
  quantResults: Record<string, QuantFieldResult[]>
  // Quality signals emitted from quant submissions; merged with choice
  // signals at compute time.
  quantSignals: QualitySignal[]
  // Node ids where the candidate revealed the author-supplied hint before
  // submitting. Used to dock the quant signal (cap at proficient) and to
  // flag the submission on the results page.
  hintsUsed: string[]
  startedAt: string
}

const qualityToScore: Record<ScoreQuality, number> = {
  strong: 88,
  proficient: 68,
  developing: 42,
}

// Build a DimensionScore from a list of quality signals collected for the
// dimension. Shared by overall + per-phase aggregations so both render with
// the same feedback voice.
function buildDimensionScore(name: string, signals: ScoreQuality[]): DimensionScore {
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

// Coarse "worst" classifier across a list of QuantBandHits. Mirrors the
// classifyAnswer logic inside QuantNode: any out-of-band trumps accepted,
// any accepted trumps ideal.
function worstBand(bands: QuantFieldResult['band'][]): QuantFieldResult['band'] {
  if (bands.some((b) => b === 'low' || b === 'high')) {
    return bands.find((b) => b === 'low' || b === 'high')!
  }
  if (bands.some((b) => b === 'accepted')) return 'accepted'
  return 'ideal'
}

export function useSimulation(scenario: Scenario) {
  const { userId } = useAuth()
  // Start at the first decision *or* quant node — both are "interactive" node
  // kinds the candidate can act on. The summary-form scenario returned to
  // unauthenticated callers has no `nodes` array; fall through to a
  // placeholder so the hook still runs (SimulationPage gates guests above
  // this and never reaches the rendered content).
  const nodes = useMemo(() => scenario.nodes ?? [], [scenario.nodes])
  const firstNode = useMemo(
    () =>
      nodes.find((n) => n.type === 'decision' || n.type === 'quant') ?? nodes[0],
    [nodes],
  )

  const [state, setState] = useState<SimulationState>({
    currentNodeId: firstNode?.nodeId ?? '',
    choicesMade: {},
    quantAnswers: {},
    quantResults: {},
    quantSignals: [],
    hintsUsed: [],
    startedAt: new Date().toISOString(),
  })

  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)

  // Memoise so the ?? fallback chain doesn't change identity every render
  // and re-trigger every downstream useCallback dep array.
  const currentNode = useMemo(
    () =>
      nodes.find((n) => n.nodeId === state.currentNodeId) ??
      firstNode ??
      ({ nodeId: '', type: 'decision', narrative: '' } as Scenario['nodes'][number]),
    [nodes, state.currentNodeId, firstNode],
  )

  const submitChoice = useCallback(
    (choiceId: string) => {
      if (!currentNode.choices) return
      const choice = currentNode.choices.find((c) => c.id === choiceId)
      if (!choice) return
      setIsTransitioning(true)
      setTimeout(() => {
        setState((prev) => ({
          ...prev,
          currentNodeId: choice.nextNodeId,
          choicesMade: { ...prev.choicesMade, [currentNode.nodeId]: choiceId },
        }))
        setSelectedChoice(null)
        setIsTransitioning(false)
      }, 400)
    },
    [currentNode]
  )

  const advanceTransition = useCallback(() => {
    if (!currentNode.nextNodeId) return
    setIsTransitioning(true)
    setTimeout(() => {
      setState((prev) => ({ ...prev, currentNodeId: currentNode.nextNodeId! }))
      setIsTransitioning(false)
    }, 300)
  }, [currentNode])

  // Quant submission. Records the answer, classification results, and the
  // emitted quality signals, then advances to the node's `nextNodeId`. Quant
  // nodes always have a single linear next pointer — there's no branching
  // off a numeric answer (different bands resolve to the same downstream).
  const submitQuant = useCallback(
    (payload: {
      answer: QuantAnswer
      results: QuantFieldResult[]
      signals: QualitySignal[]
    }) => {
      setState((prev) => ({
        ...prev,
        quantAnswers: { ...prev.quantAnswers, [currentNode.nodeId]: payload.answer },
        quantResults: { ...prev.quantResults, [currentNode.nodeId]: payload.results },
        quantSignals: [...prev.quantSignals, ...payload.signals],
      }))
    },
    [currentNode],
  )

  // Advance off a quant node after the candidate has reviewed the band
  // feedback. Separated from `submitQuant` so the feedback panel can render
  // before transitioning.
  const advanceQuant = useCallback(() => {
    if (!currentNode.nextNodeId) return
    setIsTransitioning(true)
    setTimeout(() => {
      setState((prev) => ({ ...prev, currentNodeId: currentNode.nextNodeId! }))
      setIsTransitioning(false)
    }, 300)
  }, [currentNode])

  // Idempotent — second call for the same node is a no-op so toggling the
  // hint open/closed doesn't double-flag the candidate.
  const markHintUsed = useCallback((nodeId: string) => {
    setState((prev) =>
      prev.hintsUsed.includes(nodeId)
        ? prev
        : { ...prev, hintsUsed: [...prev.hintsUsed, nodeId] },
    )
  }, [])

  // Build the carry-forward map for a node: for each formula variable that
  // declares a `source`, look up the prior quant answer and surface it.
  const buildCarryForward = useCallback(
    (
      nodeId: string,
    ): Record<string, { value: number; from: string }> => {
      const node = scenario.nodes.find((n) => n.nodeId === nodeId)
      const formula = node?.quant?.formula
      if (!formula) return {}
      const out: Record<string, { value: number; from: string }> = {}
      for (const v of formula.variables) {
        if (!v.source) continue
        const prior = state.quantAnswers[v.source.nodeId]
        if (!prior) continue
        let value: number | undefined
        if (v.source.fieldId && prior.fields) value = prior.fields[v.source.fieldId]
        else if (prior.value !== undefined) value = prior.value
        if (typeof value !== 'number') continue
        const sourceNode = scenario.nodes.find((n) => n.nodeId === v.source!.nodeId)
        out[v.name] = {
          value,
          from: sourceNode?.quant?.prompt ?? v.source.nodeId,
        }
      }
      return out
    },
    [scenario.nodes, state.quantAnswers],
  )

  const computeResult = useCallback((): ScenarioResult => {
    // ── Per-node signal map (used for the overall rubric) ───────────────────
    // signalMap aggregates every QualitySignal emitted across the run, keyed
    // by dimension name. nodeSignals tracks which node each signal came from
    // so the per-phase breakdown can sub-aggregate without re-walking the
    // scenario graph.
    const signalMap: Record<string, ScoreQuality[]> = {}
    const nodeSignals: Record<string, QualitySignal[]> = {}
    function pushSignal(nodeId: string, sig: QualitySignal) {
      if (!signalMap[sig.dimension]) signalMap[sig.dimension] = []
      signalMap[sig.dimension].push(sig.quality)
      if (!nodeSignals[nodeId]) nodeSignals[nodeId] = []
      nodeSignals[nodeId].push(sig)
    }

    for (const [nodeId, choiceId] of Object.entries(state.choicesMade)) {
      const node = scenario.nodes.find((n) => n.nodeId === nodeId)
      if (!node?.choices) continue
      const choice = node.choices.find((c) => c.id === choiceId)
      if (!choice) continue
      for (const signal of choice.qualitySignals) pushSignal(nodeId, signal)
    }
    // Quant signals are pushed by submitQuant on the same nodeId the band
    // result was computed for. The hook tracks them alongside quantResults
    // so we can pair the signal back to its source node here.
    const hintsUsedSet = new Set(state.hintsUsed)
    for (const [nodeId, results] of Object.entries(state.quantResults)) {
      const node = scenario.nodes.find((n) => n.nodeId === nodeId)
      if (!node) continue
      const dims = node.quantSignalDimensions ?? ['Quantitative Accuracy']
      const worst = worstBand(results.map((r) => r.band))
      let quality: ScoreQuality =
        worst === 'ideal' ? 'strong' : worst === 'accepted' ? 'proficient' : 'developing'
      // Hint dock — candidates who needed help can't earn a Strong rating on
      // the dimension; cap at proficient. Developing stays developing.
      if (hintsUsedSet.has(nodeId) && quality === 'strong') quality = 'proficient'
      for (const dim of dims) pushSignal(nodeId, { dimension: dim, quality })
    }

    // ── Overall dimension scores (existing behaviour) ───────────────────────
    const dimensionScores: DimensionScore[] = scenario.rubric.dimensions.map((dim) =>
      buildDimensionScore(dim.name, signalMap[dim.name] ?? []),
    )
    const overallScore = Math.round(
      dimensionScores.reduce((sum, d) => sum + d.score, 0) / dimensionScores.length,
    )

    // ── Quant results catalogue (top-level, for "what to work on") ──────────
    const quantResults: QuantNodeResultSummary[] = []
    for (const [nodeId, results] of Object.entries(state.quantResults)) {
      const node = scenario.nodes.find((n) => n.nodeId === nodeId)
      if (!node?.quant) continue
      const phase = getPhaseForNode(scenario, nodeId)
      const variables = state.quantAnswers[nodeId]?.variables
      quantResults.push({
        nodeId,
        ...(phase ? { phaseId: phase.id } : {}),
        prompt: node.quant.prompt,
        results: results.map((r) => ({
          fieldId: r.fieldId,
          modelAnswer: r.modelAnswer,
          userAnswer: r.userAnswer,
          band: r.band,
        })),
        ...(variables ? { variables } : {}),
        ...(hintsUsedSet.has(nodeId) ? { hintUsed: true } : {}),
      })
    }

    // ── Per-phase aggregation ──────────────────────────────────────────────
    let phaseScores: PhaseScore[] | undefined
    if (scenario.phases?.length) {
      phaseScores = scenario.phases.map((phase) => {
        // Per-phase signal map: only signals from nodes pinned to this phase.
        const localSignals: Record<string, ScoreQuality[]> = {}
        for (const nodeId of phase.nodeIds) {
          for (const sig of nodeSignals[nodeId] ?? []) {
            if (!localSignals[sig.dimension]) localSignals[sig.dimension] = []
            localSignals[sig.dimension].push(sig.quality)
          }
        }
        // Restrict to dimensions the phase declares (fall back to every
        // dimension touched in this phase if none declared).
        const dimensions = phase.rubricDimensions?.length
          ? phase.rubricDimensions
          : Object.keys(localSignals)
        const phaseDimensionScores = dimensions.map((dimName) =>
          buildDimensionScore(dimName, localSignals[dimName] ?? []),
        )
        const phaseOverall = phaseDimensionScores.length
          ? Math.round(
              phaseDimensionScores.reduce((sum, d) => sum + d.score, 0) /
                phaseDimensionScores.length,
            )
          : 0
        // Phase quant results (catalogue filtered by phase membership).
        const phaseQuant = quantResults.filter((q) => q.phaseId === phase.id)
        return {
          phaseId: phase.id,
          label: phase.label,
          ...(phase.description ? { description: phase.description } : {}),
          overallScore: phaseOverall,
          dimensionScores: phaseDimensionScores,
          quantResults: phaseQuant,
        }
      })
    }

    return {
      id: crypto.randomUUID(),
      userId: userId ?? 'guest',
      scenarioId: scenario.scenarioId,
      track: scenario.track,
      completedAt: new Date().toISOString(),
      overallScore,
      dimensionScores,
      choiceSequence: Object.values(state.choicesMade),
      ...(phaseScores ? { phaseScores } : {}),
      ...(quantResults.length ? { quantResults } : {}),
    }
  }, [scenario, state.choicesMade, state.quantResults, state.quantAnswers, state.hintsUsed, userId])

  const isComplete = currentNode?.type === 'feedback'
  // Step counter counts decision *and* quant submissions — both are
  // candidate-driven advancements through the case.
  const stepNumber =
    Object.keys(state.choicesMade).length +
    Object.keys(state.quantAnswers).length +
    1
  const totalInteractiveNodes = scenario.nodes.filter(
    (n) => n.type === 'decision' || n.type === 'quant',
  ).length

  return {
    currentNode,
    selectedChoice,
    setSelectedChoice,
    submitChoice,
    advanceTransition,
    isTransitioning,
    isComplete,
    stepNumber,
    totalDecisionNodes: totalInteractiveNodes,
    computeResult,
    choicesMade: state.choicesMade,
    // Quant API
    submitQuant,
    advanceQuant,
    buildCarryForward,
    markHintUsed,
    quantAnswers: state.quantAnswers,
    quantResults: state.quantResults,
    hintsUsed: state.hintsUsed,
  }
}
