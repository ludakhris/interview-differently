// Scenario validation for the document editor (#24 Phase F).
//
// Rules are phrased for authors — no nodeIds, no "quality signals" jargon.
// Each issue carries `where` so the Issues panel can jump to the block. The
// rules reflect v2's flow model: an option with no target simply continues
// to the next block, so "missing target" is never an error; a target that
// points at a block that no longer exists is.

import type { Exhibit, Scenario, ScenarioMediaAsset, ScenarioNode } from '@id/types'

export interface ValidationIssue {
  /** 'error' blocks publishing; 'warning' is shown but doesn't. */
  level: 'error' | 'warning'
  message: string
  /** Block id (nodeId / exhibit id), phase id, or the setup sentinel — for jump-to. */
  where?: { kind: 'setup' | 'phase' | 'block'; id: string; label: string }
}

const SETUP = { kind: 'setup' as const, id: '__setup__', label: 'Scenario setup' }

function blockLabel(n: ScenarioNode, index: number): string {
  const kind = n.type === 'decision' ? 'Decision' : n.type === 'quant' ? 'Quant question' : n.type === 'sql' ? 'SQL question' : n.type === 'transition' ? 'Redirect' : 'Ending'
  const text = (n.type === 'quant' ? n.quant?.prompt : n.type === 'sql' ? n.sql?.prompt : n.narrative)?.trim()
  return text ? `${kind} "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"` : `${kind} #${index + 1}`
}

export function validateScenarioDoc(scenario: Scenario, mediaAssets: ScenarioMediaAsset[] = []): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const err = (message: string, where?: ValidationIssue['where']) => issues.push({ level: 'error', message, where })
  const warn = (message: string, where?: ValidationIssue['where']) => issues.push({ level: 'warning', message, where })

  const nodes = scenario.nodes ?? []
  const exhibits = scenario.exhibits ?? []
  const phases = scenario.phases ?? []
  const nodeIds = new Set(nodes.map(n => n.nodeId))
  const exhibitIds = new Set(exhibits.map(e => e.id))
  const isImmersive = scenario.mode === 'immersive'
  const questions = nodes.filter(n => n.type === 'decision' || n.type === 'quant' || n.type === 'sql')
  const endings = nodes.filter(n => n.type === 'feedback')

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (!scenario.title?.trim()) err('Give the scenario a title.', SETUP)
  if (!scenario.briefing?.situation?.trim()) err('The briefing needs a situation — it is the first thing the candidate reads.', SETUP)
  if (!scenario.briefing?.role?.trim()) err('The briefing needs a role (who the candidate is playing).', SETUP)
  if (!(scenario.estimatedMinutes > 0)) err('Estimated minutes must be a positive number.', SETUP)
  if ((scenario.rubric?.dimensions ?? []).length === 0) err('Add at least one rubric dimension — scoring has nothing to measure.', SETUP)
  if (isImmersive && !(scenario.interviewer?.presenterId && scenario.interviewer?.voiceId)) {
    err('Immersive scenarios need an interviewer persona.', SETUP)
  }

  // ── Structure ──────────────────────────────────────────────────────────────
  if (questions.length === 0) err('Add at least one question block (decision, quant, or SQL).')
  if (!isImmersive && endings.length === 0) err('Add an ending block so the candidate gets a wrap-up and score.')

  const phaseFor = (id: string) => phases.find(p => (p.nodeIds ?? []).includes(id))
  phases.forEach(phase => {
    const where = { kind: 'phase' as const, id: phase.id, label: phase.label }
    if (!phase.label?.trim()) err('A phase has no name.', where)
    const has = (phase.nodeIds ?? []).length + (phase.exhibitIds ?? []).length
    if (has === 0) err(`Phase "${phase.label}" is empty — add a block or delete the phase.`, where)
    ;(phase.nodeIds ?? []).forEach(id => { if (!nodeIds.has(id)) err(`Phase "${phase.label}" points at a block that no longer exists.`, where) })
    ;(phase.exhibitIds ?? []).forEach(id => { if (!exhibitIds.has(id)) err(`Phase "${phase.label}" shows an exhibit that no longer exists.`, where) })
  })
  if (phases.length > 0) {
    // Reachable = placed in a phase, or targeted by some option / redirect (endings are always fine).
    const targeted = new Set<string>()
    nodes.forEach(n => {
      if (n.nextNodeId) targeted.add(n.nextNodeId)
      n.choices?.forEach(c => { if (c.nextNodeId) targeted.add(c.nextNodeId) })
    })
    nodes.forEach((n, i) => {
      if (n.type !== 'feedback' && !phaseFor(n.nodeId) && !targeted.has(n.nodeId)) {
        warn(`${blockLabel(n, i)} isn't in any phase and nothing points at it, so the candidate will never reach it.`, { kind: 'block', id: n.nodeId, label: blockLabel(n, i) })
      }
    })
  }

  // ── Blocks ─────────────────────────────────────────────────────────────────
  const assetByNode = new Map(mediaAssets.map(a => [a.nodeId, a]))
  let anyScoredOption = false

  nodes.forEach((n, i) => {
    const where = { kind: 'block' as const, id: n.nodeId, label: blockLabel(n, i) }
    const target = (id: string | undefined, what: string) => {
      if (id && !nodeIds.has(id)) err(`${where.label}: ${what} points at a block that was deleted. Pick a new target or clear it to continue.`, where)
    }

    switch (n.type) {
      case 'decision': {
        if (!n.narrative?.trim()) err(`${where.label}: write the question or narrative.`, where)
        const choices = n.choices ?? []
        if (!isImmersive) {
          if (choices.length < 2) err(`${where.label}: give the candidate at least two options.`, where)
          choices.forEach(c => {
            if (!c.text?.trim()) err(`${where.label}: option ${c.id} has no text.`, where)
            target(c.nextNodeId || undefined, `option ${c.id}`)
            if (c.qualitySignals?.length) anyScoredOption = true
          })
        }
        if (isImmersive) {
          const script = (n.audioScript ?? '').trim() || (n.narrative ?? '').trim()
          if (!script) err(`${where.label}: nothing for the interviewer to say — add a narrative or audio script.`, where)
          const asset = assetByNode.get(n.nodeId)
          if (script && (!asset || asset.status !== 'ready' || !asset.mediaUrl)) {
            err(`${where.label}: render the interviewer clip before publishing.`, where)
          }
        }
        break
      }
      case 'transition':
        if (!n.narrative?.trim()) err(`${where.label}: write the bridge text.`, where)
        target(n.nextNodeId, 'the redirect')
        break
      case 'feedback':
        if (!n.narrative?.trim()) err(`${where.label}: write the wrap-up text.`, where)
        break
      case 'quant': {
        const q = n.quant
        if (!q) { err(`${where.label}: the question is missing its settings.`, where); break }
        if (!q.prompt?.trim()) err(`${where.label}: write the question.`, where)
        const fields = q.variant === 'structured-quant' ? q.fields : [q.field]
        fields.forEach(f => {
          if (!f) return
          const b = f.acceptedRange
          if (!(b.min < b.max)) err(`${where.label}: "${f.label || f.id}" accepted range must run low to high.`, where)
          if (!(f.modelAnswer >= b.min && f.modelAnswer <= b.max)) err(`${where.label}: "${f.label || f.id}" model answer sits outside its accepted range.`, where)
          if (b.idealMin != null && b.idealMax != null) {
            if (!(b.idealMin < b.idealMax)) err(`${where.label}: "${f.label || f.id}" ideal band must run low to high.`, where)
            if (b.idealMin < b.min || b.idealMax > b.max) err(`${where.label}: "${f.label || f.id}" ideal band must sit inside the accepted range.`, where)
          }
        })
        if (q.formula) {
          const tokens = new Set([...q.formula.expression.matchAll(/\{([^}]+)\}/g)].map(m => m[1]))
          const names = new Set(q.formula.variables.map(v => v.name))
          tokens.forEach(t => { if (!names.has(t)) err(`${where.label}: the formula uses "${t}" but no such variable is defined.`, where) })
          q.formula.variables.forEach(v => {
            if (!v.label?.trim()) err(`${where.label}: variable "${v.name}" needs a label.`, where)
            if (v.source && !nodeIds.has(v.source.nodeId)) err(`${where.label}: "${v.label || v.name}" carries forward from a question that was deleted.`, where)
          })
        }
        break
      }
      case 'sql': {
        const s = n.sql
        if (!s) { err(`${where.label}: the question is missing its settings.`, where); break }
        if (!s.prompt?.trim()) err(`${where.label}: write the business ask.`, where)
        if (!s.datasetSlug) err(`${where.label}: pick a dataset.`, where)
        if (!s.referenceSql?.trim()) err(`${where.label}: add the reference query — its result set is the answer key.`, where)
        break
      }
    }
  })

  if (!isImmersive && questions.some(n => n.type === 'decision') && !anyScoredOption) {
    err('No decision option is rated Strong / Proficient / Developing yet — scoring has nothing to work with.')
  }

  // ── Exhibits ───────────────────────────────────────────────────────────────
  exhibits.forEach((e: Exhibit, i) => {
    const label = `Exhibit "${e.title?.trim() || `#${i + 1}`}"`
    if (!e.title?.trim()) warn(`${label} has no title.`, { kind: 'block', id: e.id, label })
    if (phases.length > 0 && !phases.some(p => (p.exhibitIds ?? []).includes(e.id))) {
      warn(`${label} isn't shown in any phase.`, { kind: 'block', id: e.id, label })
    }
  })

  return issues
}

export const hasBlockingIssues = (issues: ValidationIssue[]) => issues.some(i => i.level === 'error')
