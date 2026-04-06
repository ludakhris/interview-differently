import type { Scenario } from '@id/types'

export interface ValidationError {
  nodeId?: string
  message: string
}

export function validateScenario(scenario: Scenario): ValidationError[] {
  const errors: ValidationError[] = []
  const decisionNodes = scenario.nodes.filter(n => n.type === 'decision')
  const feedbackNodes = scenario.nodes.filter(n => n.type === 'feedback')

  if (decisionNodes.length === 0) {
    errors.push({ message: 'Scenario must contain at least one Decision node' })
  }
  if (feedbackNodes.length === 0) {
    errors.push({ message: 'Scenario must contain at least one Feedback Trigger node' })
  }
  if (scenario.rubric.dimensions.length === 0) {
    errors.push({ message: 'At least one rubric dimension is required' })
  }

  let hasAnySignal = false
  for (const node of decisionNodes) {
    const choices = node.choices ?? []
    const ids: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D']
    for (const id of ids) {
      const choice = choices.find(c => c.id === id)
      if (!choice || !choice.text.trim()) {
        errors.push({ nodeId: node.nodeId, message: `Decision node: choice ${id} is missing text` })
      }
      if (!choice?.nextNodeId) {
        errors.push({ nodeId: node.nodeId, message: `Decision node: choice ${id} has no next node` })
      }
    }
    if (choices.some(c => c.qualitySignals.length > 0)) hasAnySignal = true
  }
  if (decisionNodes.length > 0 && !hasAnySignal) {
    errors.push({ message: 'No quality signals tagged — the scoring engine has nothing to evaluate' })
  }

  return errors
}
