import type { CourseSkill } from './learn-types'

export type SkillStatus = 'gap' | 'demonstrated' | 'unknown'

export interface SkillResult {
  skillId: string
  label: string
  targetPct: number
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
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** The skill an item is remediation for, or null for an ordinary outline item. */
export const remediationOf = (config: unknown): string | null => {
  const v = obj(config).remediationFor
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
    return typeof o.id === 'string' &&
      typeof o.label === 'string' &&
      typeof o.targetPct === 'number'
      ? [{ id: o.id, label: o.label, targetPct: o.targetPct }]
      : []
  })
}

/**
 * Where a learner stands on each skill, from what they have answered so far.
 * Evidence is the latest result of each tagged quiz question (right or wrong)
 * and the best score of each interview tagged with the skill. Remediation items
 * are not evidence: they exist to close a gap, not to find one. With no evidence
 * a skill is unknown, never a gap.
 */
export function skillResults(
  skills: CourseSkill[],
  items: ItemLite[],
  progress: Map<string, ProgressLite>
): SkillResult[] {
  return skills.map((skill) => {
    const points: number[] = []
    for (const item of items) {
      const p = progress.get(item.id)
      if (!p || p.status !== 'completed' || remediationOf(item.config)) continue
      const config = obj(item.config)
      if (item.type === 'knowledge_check' || item.type === 'assessment') {
        const results = obj(p.data).results
        if (!Array.isArray(results) || !Array.isArray(config.questions)) continue
        for (const q of config.questions) {
          const question = obj(q)
          if (question.skill !== skill.id || typeof question.id !== 'string') continue
          const hit = results.map(obj).find((r) => r.id === question.id)
          if (hit && typeof hit.correct === 'boolean') points.push(hit.correct ? 1 : 0)
        }
      } else if (
        (item.type === 'interview' || item.type === 'tool') &&
        config.skill === skill.id &&
        p.score !== null
      ) {
        points.push(p.score / 100)
      }
    }
    const n = points.length
    const pct = n === 0 ? null : Math.round((points.reduce((a, b) => a + b, 0) / n) * 100)
    const status: SkillStatus =
      pct === null ? 'unknown' : pct < skill.targetPct ? 'gap' : 'demonstrated'
    return { skillId: skill.id, label: skill.label, targetPct: skill.targetPct, pct, n, status }
  })
}
