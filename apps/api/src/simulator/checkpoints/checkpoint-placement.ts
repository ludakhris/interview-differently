import type { CheckpointPlacement } from '../../core/practice-port'
import type { AssessmentSection } from '../assessments/assessment.types'
import { questionIndex } from '../assessments/parse-markdown'

const MAX_REFS = 50
const MAX_REF = 80
const MAX_TEXT = 300
const MAX_SCENARIO = 2000

const isText = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max

/**
 * A placement as the Simulator keeps it: the course's (CheckpointPlacement), plus what only the Simulator sets.
 * `oneAnswer`: each request takes exactly one answer, as at work (a standalone work simulation, see placementFromBank).
 * Kept only when true, so a placement without it reads back unchanged and samePlacement still holds.
 */
export type SimulatorPlacement = CheckpointPlacement & { oneAnswer?: true }

const refsOf = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length <= MAX_REFS && v.every((r) => isText(r, MAX_REF))
    ? [...(v as string[])]
    : null

/**
 * A checkpoint placement as the LMS sends it (the LTI custom parameter `checkpoint`, or a delivery's stored config),
 * checked strictly; null when anything is off. Never trust the claim: it is read again here.
 */
export function parsePlacement(v: unknown): SimulatorPlacement | null {
  if (typeof v === 'string') {
    try {
      return parsePlacement(JSON.parse(v))
    } catch {
      return null
    }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const refs = refsOf(o.refs)
  if (!isText(o.bankSlug, MAX_TEXT) || !refs || typeof o.title !== 'string') return null
  if (o.title.length > MAX_TEXT) return null
  if (o.scenario !== null && !isText(o.scenario, MAX_SCENARIO)) return null
  if (typeof o.diagnostic !== 'boolean') return null
  if (o.oneAnswer !== undefined && typeof o.oneAnswer !== 'boolean') return null
  let practice: CheckpointPlacement['practice'] = null
  if (o.practice !== null) {
    const p = o.practice as Record<string, unknown> | undefined
    const evidenceRefs = refsOf(p?.evidenceRefs)
    if (!p || !isText(p.skill, MAX_TEXT) || !evidenceRefs || typeof p.review !== 'boolean')
      return null
    practice = { skill: p.skill, evidenceRefs, review: p.review }
  } else if (refs.length === 0) return null
  let groups: string[][] | undefined
  if (o.groups !== undefined) {
    if (!Array.isArray(o.groups) || o.groups.length > MAX_REFS) return null
    const parsed = o.groups.map(refsOf)
    if (parsed.some((g) => !g || g.some((r) => !refs.includes(r)))) return null
    groups = parsed as string[][]
  }
  return {
    bankSlug: o.bankSlug,
    refs,
    title: o.title,
    scenario: (o.scenario as string | null) ?? null,
    diagnostic: o.diagnostic,
    ...(o.oneAnswer === true ? { oneAnswer: true as const } : {}),
    ...(groups ? { groups } : {}),
    practice,
  }
}

/**
 * Whether two placements say the same thing (a relaunch with a changed course updates the stored one). Both are read
 * the same way, so the order their keys were written in does not matter.
 */
export const samePlacement = (a: unknown, b: SimulatorPlacement): boolean =>
  JSON.stringify(parsePlacement(a)) === JSON.stringify(parsePlacement(b))

/**
 * The placement's refs that are not SQL questions in the bank (`sections` is the bank's stored sections). A placement
 * with any is refused, so the Simulator and the LMS always agree on which requests exist.
 */
export function unknownRefs(sections: unknown, refs: string[]): string[] {
  const index = questionIndex((Array.isArray(sections) ? sections : []) as AssessmentSection[])
  return refs.filter((r) => index.get(r)?.type !== 'sql')
}

/** What a learner or the course team is told when a placement names questions the bank does not have. */
export const UNKNOWN_REFS_MESSAGE =
  'This checkpoint asks for questions its question bank does not have. Ask the course team to check it.'
