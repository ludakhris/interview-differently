import { useState, useCallback } from 'react'
import type { Scenario, ScenarioResult, DimensionScore, ScoreQuality } from '@id/types'

interface SimulationState {
  currentNodeId: string
  choicesMade: Record<string, string>
  startedAt: string
}

const qualityToScore: Record<ScoreQuality, number> = {
  strong: 88,
  proficient: 68,
  developing: 42,
}

export function useSimulation(scenario: Scenario) {
  const firstNode = scenario.nodes.find((n) => n.type === 'decision')!

  const [state, setState] = useState<SimulationState>({
    currentNodeId: firstNode.nodeId,
    choicesMade: {},
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
      userId: 'demo-user',
      scenarioId: scenario.scenarioId,
      track: scenario.track,
      completedAt: new Date().toISOString(),
      overallScore,
      dimensionScores,
      choiceSequence: Object.values(state.choicesMade),
    }
  }, [scenario, state.choicesMade])

  const isComplete = currentNode?.type === 'feedback'
  const stepNumber = Object.keys(state.choicesMade).length + 1
  const totalDecisionNodes = scenario.nodes.filter((n) => n.type === 'decision').length

  return {
    currentNode,
    selectedChoice,
    setSelectedChoice,
    submitChoice,
    advanceTransition,
    isTransitioning,
    isComplete,
    stepNumber,
    totalDecisionNodes,
    computeResult,
    choicesMade: state.choicesMade,
  }
}
