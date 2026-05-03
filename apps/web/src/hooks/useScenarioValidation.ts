import type { Scenario, ScenarioMediaAsset } from '@id/types'

export interface ValidationError {
  nodeId?: string
  message: string
}

export function validateScenario(scenario: Scenario, mediaAssets: ScenarioMediaAsset[] = []): ValidationError[] {
  const errors: ValidationError[] = []
  const decisionNodes = scenario.nodes.filter(n => n.type === 'decision')
  const feedbackNodes = scenario.nodes.filter(n => n.type === 'feedback')
  const isImmersive = scenario.mode === 'immersive'

  if (decisionNodes.length === 0) {
    errors.push({ message: 'Scenario must contain at least one Decision node' })
  }
  if (scenario.rubric.dimensions.length === 0) {
    errors.push({ message: 'At least one rubric dimension is required' })
  }

  // ── Traditional-mode checks ────────────────────────────────────────────
  // Immersive scenarios capture a verbal response per node — they don't have
  // multi-choice routing, branching feedback nodes, or quality signals on
  // choices. The AI evaluates the transcript against the rubric instead.
  // Skip the choice/feedback/signal validations when mode === 'immersive'.
  if (!isImmersive) {
    if (feedbackNodes.length === 0) {
      errors.push({ message: 'Scenario must contain at least one Feedback Trigger node' })
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
  }

  // ── Immersive-mode checks ──────────────────────────────────────────────
  // Persona must be set, and every decision node with a script must have
  // a ready render. Stale-detection (script changed since render) is the
  // builder UI's responsibility — here we only verify a 'ready' asset exists.
  if (isImmersive) {
    if (!scenario.interviewer?.presenterId || !scenario.interviewer?.voiceId) {
      errors.push({ message: 'Immersive scenarios require an interviewer persona — pick one in the briefing' })
    }
    const assetByNode = new Map(mediaAssets.map(a => [a.nodeId, a]))
    for (const node of decisionNodes) {
      const script = (node.audioScript ?? '').trim() || (node.narrative ?? '').trim()
      if (!script) {
        errors.push({ nodeId: node.nodeId, message: 'Decision node has no audio script or narrative to render' })
        continue
      }
      const asset = assetByNode.get(node.nodeId)
      if (!asset || asset.status !== 'ready' || !asset.mediaUrl) {
        errors.push({ nodeId: node.nodeId, message: 'Decision node has no rendered avatar clip — render it before publishing' })
      }
    }
  }

  return errors
}
