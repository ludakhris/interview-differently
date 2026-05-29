// Phase utilities. Used by SimulationPage + PhaseStepper.
//
// A scenario may declare ordered phases (`scenario.phases`) that pin nodes
// and exhibits to stages of the interview. When no phases are declared we
// synthesise a single implicit phase so the rest of the UI can render the
// same way for legacy scenarios.

import type { Scenario, ScenarioPhase } from '@id/types'

export type PhaseStatus = 'locked' | 'active' | 'complete'

export interface PhaseView {
  phase: ScenarioPhase
  index: number
  status: PhaseStatus
  isImplicit: boolean
}

/**
 * Return the ordered phase list for a scenario. If the scenario has no
 * declared phases we synthesise a single implicit phase containing every
 * decision node — that keeps the stepper UI optional rather than required
 * for every scenario.
 */
export function getPhases(scenario: Scenario): ScenarioPhase[] {
  if (scenario.phases?.length) return scenario.phases

  const decisionNodeIds = scenario.nodes
    .filter(n => n.type === 'decision')
    .map(n => n.nodeId)

  return [
    {
      id: '__implicit__',
      label: 'Simulation',
      nodeIds: decisionNodeIds,
    },
  ]
}

/**
 * Find the phase that owns a given node id. Returns null if the node isn't
 * pinned to any phase (e.g. a transition/feedback node only referenced via
 * `next` links rather than explicitly listed in `nodeIds`).
 */
export function getPhaseForNode(
  scenario: Scenario,
  nodeId: string,
): ScenarioPhase | null {
  const phases = getPhases(scenario)
  return phases.find(p => p.nodeIds.includes(nodeId)) ?? null
}

/**
 * Build a view-model of every phase with its status relative to the current
 * node + the set of answered nodes.
 *
 * Lock policy (simplest defensible model): walk phases in declared order,
 * find the one that owns the current node — that's "active". Everything
 * earlier is "complete", everything later is "locked". If the current node
 * isn't pinned to any phase (e.g. a transition node), fall back to the
 * latest phase that has at least one answered node.
 */
export function buildPhaseViews(
  scenario: Scenario,
  currentNodeId: string,
  answeredNodeIds: Set<string>,
): PhaseView[] {
  const phases = getPhases(scenario)
  const isImplicit = !scenario.phases?.length

  let activeIndex = phases.findIndex(p => p.nodeIds.includes(currentNodeId))
  if (activeIndex < 0) {
    activeIndex = phases.reduce(
      (latest, p, i) =>
        p.nodeIds.some(id => answeredNodeIds.has(id)) ? i : latest,
      0,
    )
  }

  return phases.map((phase, index) => {
    const status: PhaseStatus =
      index < activeIndex ? 'complete'
        : index === activeIndex ? 'active'
          : 'locked'
    return { phase, index, status, isImplicit }
  })
}
