import { useState, useCallback } from 'react'
import { useAuth } from '@clerk/clerk-react'
import type {
  Scenario,
  ScenarioResult,
  DimensionScore,
  ScoreQuality,
  QualitySignal,
  QuantAnswer,
  QuantFieldResult,
} from '@id/types'

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
  startedAt: string
}

const qualityToScore: Record<ScoreQuality, number> = {
  strong: 88,
  proficient: 68,
  developing: 42,
}

export function useSimulation(scenario: Scenario) {
  const { userId } = useAuth()
  // Start at the first decision *or* quant node — both are "interactive" node
  // kinds the candidate can act on.
  const firstNode =
    scenario.nodes.find((n) => n.type === 'decision' || n.type === 'quant') ??
    scenario.nodes[0]

  const [state, setState] = useState<SimulationState>({
    currentNodeId: firstNode.nodeId,
    choicesMade: {},
    quantAnswers: {},
    quantResults: {},
    quantSignals: [],
    startedAt: new Date().toISOString(),
  })

  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const currentNode = scenario.nodes.find((n) => n.nodeId === state.currentNodeId)!

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
    const signalMap: Record<string, ScoreQuality[]> = {}
    for (const [nodeId, choiceId] of Object.entries(state.choicesMade)) {
      const node = scenario.nodes.find((n) => n.nodeId === nodeId)
      if (!node?.choices) continue
      const choice = node.choices.find((c) => c.id === choiceId)
      if (!choice) continue
      for (const signal of choice.qualitySignals) {
        if (!signalMap[signal.dimension]) signalMap[signal.dimension] = []
        signalMap[signal.dimension].push(signal.quality)
      }
    }
    // Fold in quant signals (emitted by submitQuant) — same dimension-quality
    // contract as choice signals, just sourced from band classifications.
    for (const signal of state.quantSignals) {
      if (!signalMap[signal.dimension]) signalMap[signal.dimension] = []
      signalMap[signal.dimension].push(signal.quality)
    }

    const dimensionScores: DimensionScore[] = scenario.rubric.dimensions.map((dim) => {
      const signals = signalMap[dim.name] ?? []
      const avgScore =
        signals.length > 0
          ? Math.round(signals.reduce((sum, q) => sum + qualityToScore[q], 0) / signals.length)
          : 55
      const quality: ScoreQuality =
        avgScore >= 80 ? 'strong' : avgScore >= 60 ? 'proficient' : 'developing'
      const feedbackMap: Record<ScoreQuality, string> = {
        strong: `You demonstrated strong ${dim.name.toLowerCase()}. Your decisions reflected clear judgment and appropriate calibration to the situation.`,
        proficient: `Your ${dim.name.toLowerCase()} was solid. There were moments where a sharper prioritization would have strengthened your response.`,
        developing: `${dim.name} is an area to develop. Your decisions here suggest an opportunity to build more structured habits around this competency.`,
      }
      return { dimension: dim.name, score: avgScore, quality, feedback: feedbackMap[quality] }
    })

    const overallScore = Math.round(
      dimensionScores.reduce((sum, d) => sum + d.score, 0) / dimensionScores.length
    )

    return {
      id: crypto.randomUUID(),
      userId: userId ?? 'guest',
      scenarioId: scenario.scenarioId,
      track: scenario.track,
      completedAt: new Date().toISOString(),
      overallScore,
      dimensionScores,
      choiceSequence: Object.values(state.choicesMade),
    }
  }, [scenario, state.choicesMade, state.quantSignals, userId])

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
    quantAnswers: state.quantAnswers,
    quantResults: state.quantResults,
  }
}
