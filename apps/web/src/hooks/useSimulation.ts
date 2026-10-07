import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@clerk/clerk-react'
import type {
  Scenario,
  ScenarioResult,
  ScoreQuality,
  QualitySignal,
  QuantAnswer,
  QuantFieldResult,
  QuantNodeResultSummary,
  SqlNodeResultSummary,
  PhaseScore,
} from '@id/types'
import { getPhaseForNode } from '@/lib/phases'
import {
  fetchPlay,
  onPlayConflict,
  type PlayGrader,
  type PlayView,
} from '@/services/ltiPlayService'
import { buildDimensionScore, collectSignals, scoreDimensions, type Run } from '@/lib/scoring'

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
  // SQL submissions at sql nodes. Keyed by nodeId; one submission per node.
  sqlAnswers: Record<string, { sql: string; correct: boolean; reason?: string }>
  startedAt: string
}

/**
 * A launched (LTI) play: the server grades every answer and decides the score, and it remembers
 * the play, so a reload resumes from `initial` instead of starting over.
 */
export interface RemotePlay {
  grader: PlayGrader
  initial: PlayView
}

export function useSimulation(scenario: Scenario, remote?: RemotePlay) {
  const { userId } = useAuth()
  // Start at the first decision *or* quant node — both are "interactive" node
  // kinds the candidate can act on. The summary-form scenario returned to
  // unauthenticated callers has no `nodes` array; fall through to a
  // placeholder so the hook still runs (SimulationPage gates guests above
  // this and never reaches the rendered content).
  const nodes = useMemo(() => scenario.nodes ?? [], [scenario.nodes])
  const firstNode = useMemo(
    () =>
      nodes.find((n) => n.type === 'decision' || n.type === 'quant' || n.type === 'sql') ??
      nodes[0],
    [nodes]
  )

  const [state, setState] = useState<SimulationState>(() => ({
    currentNodeId: remote?.initial.node ?? firstNode?.nodeId ?? '',
    choicesMade: remote?.initial.choices ?? {},
    quantAnswers: remote?.initial.quant ?? {},
    quantResults: {},
    quantSignals: [],
    // a resumed play only needs to know which nodes were answered; the server holds the verdicts
    sqlAnswers: Object.fromEntries(
      Object.entries(remote?.initial.sql ?? {}).map(([nodeId, a]) => [
        nodeId,
        { sql: a.sql, correct: false },
      ])
    ),
    hintsUsed: remote?.initial.hints ?? [],
    startedAt: new Date().toISOString(),
  }))
  // why the server refused an answer, shown to the learner who can then try again
  const [playError, setPlayError] = useState<string | null>(null)
  // one decision in flight at a time: a double click must not send the answer twice
  const sending = useRef(false)

  // The server is the source of truth for where a launched play is. When it says the browser is
  // out of step (409), take its position instead of retrying a question it will not take again.
  useEffect(() => {
    if (!remote) return
    return onPlayConflict(() => {
      fetchPlay()
        .then((view) =>
          setState((prev) => ({
            ...prev,
            currentNodeId: view.node,
            choicesMade: view.choices,
            quantAnswers: view.quant,
            sqlAnswers: Object.fromEntries(
              Object.entries(view.sql).map(([nodeId, a]) => [
                nodeId,
                { sql: a.sql, correct: false },
              ])
            ),
            hintsUsed: view.hints,
          }))
        )
        .then(() => {
          setSelectedChoice(null)
          setIsTransitioning(false)
          setPlayError(null)
        })
        .catch(() => undefined)
    })
  }, [remote])

  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)

  // Memoise so the ?? fallback chain doesn't change identity every render
  // and re-trigger every downstream useCallback dep array.
  const currentNode = useMemo(
    () =>
      nodes.find((n) => n.nodeId === state.currentNodeId) ??
      firstNode ??
      ({ nodeId: '', type: 'decision', narrative: '' } as Scenario['nodes'][number]),
    [nodes, state.currentNodeId, firstNode]
  )

  const submitChoice = useCallback(
    (choiceId: string) => {
      if (!currentNode.choices || sending.current) return
      const choice = currentNode.choices.find((c) => c.id === choiceId)
      if (!choice) return
      sending.current = true
      setIsTransitioning(true)
      setPlayError(null)
      const advance = () =>
        setTimeout(() => {
          setState((prev) => ({
            ...prev,
            currentNodeId: choice.nextNodeId,
            choicesMade: { ...prev.choicesMade, [currentNode.nodeId]: choiceId },
          }))
          setSelectedChoice(null)
          setIsTransitioning(false)
          sending.current = false
        }, 400)
      if (!remote) {
        advance()
        return
      }
      // a launched play moves on only once the server has recorded the choice
      remote.grader
        .choose(currentNode.nodeId, choiceId)
        .then(advance)
        .catch((err: Error) => {
          setPlayError(err.message)
          setIsTransitioning(false)
          sending.current = false
        })
    },
    [currentNode, remote]
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
    (payload: { answer: QuantAnswer; results: QuantFieldResult[]; signals: QualitySignal[] }) => {
      setState((prev) => ({
        ...prev,
        quantAnswers: { ...prev.quantAnswers, [currentNode.nodeId]: payload.answer },
        quantResults: { ...prev.quantResults, [currentNode.nodeId]: payload.results },
        quantSignals: [...prev.quantSignals, ...payload.signals],
      }))
    },
    [currentNode]
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

  // SQL submission — records the graded outcome for the current node. The
  // signal is derived at compute time (correct → strong, wrong → developing,
  // hint caps at proficient) so the hint dock rule lives in one place.
  const submitSql = useCallback(
    (payload: { sql: string; correct: boolean; reason?: string }) => {
      setState((prev) => ({
        ...prev,
        sqlAnswers: { ...prev.sqlAnswers, [currentNode.nodeId]: payload },
      }))
    },
    [currentNode]
  )

  const advanceSql = useCallback(() => {
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
      prev.hintsUsed.includes(nodeId) ? prev : { ...prev, hintsUsed: [...prev.hintsUsed, nodeId] }
    )
  }, [])

  // Build the carry-forward map for a node: for each formula variable that
  // declares a `source`, look up the prior quant answer and surface it.
  const buildCarryForward = useCallback(
    (nodeId: string): Record<string, { value: number; from: string }> => {
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
    [scenario.nodes, state.quantAnswers]
  )

  const computeResult = useCallback((): ScenarioResult => {
    // signalMap aggregates every QualitySignal emitted across the run, keyed by dimension name.
    // nodeSignals tracks which node each signal came from so the per-phase breakdown can
    // sub-aggregate without re-walking the scenario graph.
    const hintsUsedSet = new Set(state.hintsUsed)
    const run: Run = {
      choices: state.choicesMade,
      quant: Object.fromEntries(Object.entries(state.quantResults)),
      sql: Object.fromEntries(
        Object.entries(state.sqlAnswers).map(([nodeId, a]) => [nodeId, a.correct])
      ),
      hints: state.hintsUsed,
    }
    const { signalMap, nodeSignals } = collectSignals(scenario, run)

    // ── Overall dimension scores ────────────────────────────────────────────
    const { dimensionScores, overallScore } = scoreDimensions(scenario, signalMap)

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

    // ── SQL results catalogue ───────────────────────────────────────────────
    const sqlResults: SqlNodeResultSummary[] = []
    for (const [nodeId, answer] of Object.entries(state.sqlAnswers)) {
      const node = scenario.nodes.find((n) => n.nodeId === nodeId)
      if (!node?.sql) continue
      const phase = getPhaseForNode(scenario, nodeId)
      sqlResults.push({
        nodeId,
        ...(phase ? { phaseId: phase.id } : {}),
        prompt: node.sql.prompt,
        sql: answer.sql,
        correct: answer.correct,
        ...(answer.reason ? { reason: answer.reason } : {}),
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
          buildDimensionScore(dimName, localSignals[dimName] ?? [])
        )
        const phaseOverall = phaseDimensionScores.length
          ? Math.round(
              phaseDimensionScores.reduce((sum, d) => sum + d.score, 0) /
                phaseDimensionScores.length
            )
          : 0
        // Phase quant results (catalogue filtered by phase membership).
        const phaseQuant = quantResults.filter((q) => q.phaseId === phase.id)
        const phaseSql = sqlResults.filter((q) => q.phaseId === phase.id)
        return {
          phaseId: phase.id,
          label: phase.label,
          ...(phase.description ? { description: phase.description } : {}),
          overallScore: phaseOverall,
          dimensionScores: phaseDimensionScores,
          quantResults: phaseQuant,
          ...(phaseSql.length ? { sqlResults: phaseSql } : {}),
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
      ...(sqlResults.length ? { sqlResults } : {}),
    }
  }, [
    scenario,
    state.choicesMade,
    state.quantResults,
    state.quantAnswers,
    state.sqlAnswers,
    state.hintsUsed,
    userId,
  ])

  const isComplete = currentNode?.type === 'feedback'
  // Step counter counts decision *and* quant submissions — both are
  // candidate-driven advancements through the case.
  const stepNumber =
    Object.keys(state.choicesMade).length +
    Object.keys(state.quantAnswers).length +
    Object.keys(state.sqlAnswers).length +
    1
  const totalInteractiveNodes = scenario.nodes.filter(
    (n) => n.type === 'decision' || n.type === 'quant' || n.type === 'sql'
  ).length

  return {
    currentNode,
    selectedChoice,
    setSelectedChoice,
    submitChoice,
    playError,
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
    // SQL API
    submitSql,
    advanceSql,
    sqlAnswers: state.sqlAnswers,
  }
}
