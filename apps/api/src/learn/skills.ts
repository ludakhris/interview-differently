import type { CourseSkill } from './learn-types'

/** `emerging`: at the pass mark, but on less evidence than the skill asks for (`minEvidence`). */
export type SkillStatus = 'gap' | 'demonstrated' | 'emerging' | 'unknown'

export interface SkillResult {
  skillId: string
  label: string
  targetPct: number
  minEvidence: number
  /** Share of the evidence that was right, 0-100, or null with no evidence. */
  pct: number | null
  /** How many pieces of evidence it rests on: tagged questions answered, plus tagged interviews. */
  n: number
  status: SkillStatus
}

interface ItemLite {
  id: string
  type: string
  config: unknown
}
interface ProgressLite {
  status: string
  score: number | null
  data: unknown
  completedAt?: Date | null
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** The skill an item is remediation for, or null for an ordinary outline item. */
export const remediationOf = (config: unknown): string | null => {
  const v = obj(config).remediationFor
  return typeof v === 'string' && v ? v : null
}

/** The skill an outline item teaches (config `teaches`): a learner who has shown it may be let past it. */
export const teachesOf = (config: unknown): string | null => {
  const v = obj(config).teaches
  return typeof v === 'string' && v ? v : null
}

/** The skill an ordinary outline item is added back to the plan for, to be reviewed, or null. */
export const reviewOf = (config: unknown): string | null => {
  const v = obj(config).reviewFor
  return typeof v === 'string' && v ? v : null
}

/** Whether an item was completed at or after `since` (when it was added to the learner's plan). */
export const doneSince = (
  progress: { status: string; completedAt: Date | null } | null | undefined,
  since: Date
): boolean =>
  !!progress &&
  progress.status === 'completed' &&
  !!progress.completedAt &&
  progress.completedAt.getTime() >= since.getTime()

/** Course skills as stored, dropping anything malformed. */
export function parseSkills(v: unknown): CourseSkill[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((s): CourseSkill[] => {
    const o = obj(s)
    if (typeof o.id !== 'string' || typeof o.label !== 'string' || typeof o.targetPct !== 'number')
      return []
    const min = o.minEvidence
    return [
      {
        id: o.id,
        label: o.label,
        targetPct: o.targetPct,
        ...(typeof min === 'number' && Number.isInteger(min) && min > 1
          ? { minEvidence: min }
          : {}),
      },
    ]
  })
}

/** The tool a checkpoint item launches: the Simulator's chat checkpoint (GitHub issue #90). */
export const CHECKPOINT_TOOL_ID = 'id-checkpoint'

/**
 * Where a learner stands on each skill, from what they have answered so far.
 * Evidence is the latest result of each tagged quiz question (right or wrong)
 * the latest result of each tagged SQL checkpoint task, and the best score of each
 * interview tagged with the skill. Remediation items (generated practice included)
 * are not evidence: they exist to close a gap, not to find one. With no evidence
 * a skill is unknown, never a gap; at the pass mark on less evidence than the skill's
 * `minEvidence` it is emerging, not yet shown.
 *
 * A skill with `minEvidence` (an adaptive course) is judged on its most recent `minEvidence` pieces of
 * evidence: what the learner can do now, so early misses stop counting once they have learned it. A
 * skill without it is judged on all its evidence, as before.
 */
export function skillResults(
  skills: CourseSkill[],
  items: ItemLite[],
  progress: Map<string, ProgressLite>
): SkillResult[] {
  return skills.map((skill) => {
    const points: { v: number; at: number }[] = []
    for (const item of items) {
      const p = progress.get(item.id)
      if (!p || p.status !== 'completed' || remediationOf(item.config)) continue
      const config = obj(item.config)
      const at = p.completedAt instanceof Date ? p.completedAt.getTime() : 0
      if (item.type === 'knowledge_check') {
        const results = obj(p.data).results
        if (!Array.isArray(results) || !Array.isArray(config.questions)) continue
        for (const q of config.questions) {
          const question = obj(q)
          if (question.skill !== skill.id || typeof question.id !== 'string') continue
          const hit = results.map(obj).find((r) => r.id === question.id)
          if (hit && typeof hit.correct === 'boolean') points.push({ v: hit.correct ? 1 : 0, at })
        }
      } else if (item.type === 'tool' && config.toolId === CHECKPOINT_TOOL_ID) {
        // A checkpoint: the LMS keeps each request's latest result, read from the Simulator (adaptive/sync).
        const results = obj(p.data).results
        if (!Array.isArray(results) || !Array.isArray(config.tasks)) continue
        for (const t of config.tasks) {
          const task = obj(t)
          if (task.skill !== skill.id || typeof task.ref !== 'string') continue
          const hit = results.map(obj).find((r) => r.ref === task.ref)
          // Each task records when it was last answered, so a retried task counts as recent.
          const when = typeof hit?.at === 'string' ? Date.parse(hit.at) : NaN
          // A pass ("not learned this yet") is no evidence either way.
          if (hit && typeof hit.correct === 'boolean' && hit.passed !== true)
            points.push({ v: hit.correct ? 1 : 0, at: Number.isNaN(when) ? at : when })
        }
      } else if (
        (item.type === 'interview' || item.type === 'tool') &&
        config.skill === skill.id &&
        p.score !== null
      ) {
        points.push({ v: p.score / 100, at })
      }
    }
    const n = points.length
    const judged = skill.minEvidence
      ? [...points].sort((a, b) => a.at - b.at).slice(-skill.minEvidence)
      : points
    const pct =
      n === 0 ? null : Math.round((judged.reduce((a, b) => a + b.v, 0) / judged.length) * 100)
    const minEvidence = skill.minEvidence ?? 1
    const status: SkillStatus =
      pct === null
        ? 'unknown'
        : pct < skill.targetPct
          ? 'gap'
          : n < minEvidence
            ? 'emerging'
            : 'demonstrated'
    return {
      skillId: skill.id,
      label: skill.label,
      targetPct: skill.targetPct,
      minEvidence,
      pct,
      n,
      status,
    }
  })
}

/** A course's adaptive rules as stored (Course.adaptive), with everything off by default. */
export function adaptiveRules(v: unknown): { testOut: boolean; approveGenerated: boolean } {
  const o = obj(v)
  return { testOut: o.testOut === true, approveGenerated: o.approveGenerated === true }
}
