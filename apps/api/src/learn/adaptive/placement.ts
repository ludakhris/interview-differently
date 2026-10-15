import type { CheckpointPlacement } from '../../core/practice-port'
import { CHECKPOINT_TOOL_ID, adaptiveRules, parseSkills } from '../skills'

export { CHECKPOINT_TOOL_ID }

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** A course item's config as stored, for the parts a checkpoint uses. */
export interface CheckpointItemConfig {
  bank: string
  tasks: { ref: string; skill: string }[]
  scenario: string | null
  diagnostic: boolean
  /** A practice slot: the skill (its course id) the Simulator writes requests for. */
  generated: string | null
}

/** A checkpoint item's config, or null for any other item. */
export function checkpointConfig(item: {
  type: string
  config: unknown
}): CheckpointItemConfig | null {
  const c = obj(item.config)
  if (item.type !== 'tool' || c.toolId !== CHECKPOINT_TOOL_ID || typeof c.ref !== 'string')
    return null
  const tasks = Array.isArray(c.tasks)
    ? c.tasks.flatMap((t) => {
        const o = obj(t)
        return typeof o.ref === 'string' && typeof o.skill === 'string'
          ? [{ ref: o.ref, skill: o.skill }]
          : []
      })
    : []
  const generated = obj(c.generated).skill
  return {
    bank: c.ref,
    tasks,
    scenario: typeof c.scenario === 'string' && c.scenario.trim() ? c.scenario : null,
    diagnostic: c.diagnostic === true,
    generated: typeof generated === 'string' ? generated : null,
  }
}

/** A checkpoint's requests grouped by the skill they test, in course order. */
export function groupsOf(tasks: { ref: string; skill: string }[]): string[][] {
  const by = new Map<string, string[]>()
  for (const t of tasks) by.set(t.skill, [...(by.get(t.skill) ?? []), t.ref])
  return [...by.values()]
}

/**
 * What the LMS tells the Simulator about a checkpoint it launches: the requests to ask, or for a practice slot the
 * skill and the requests elsewhere in the course whose misses the practice should aim at.
 */
export function placementOf(
  item: { type: string; title: string; config: unknown },
  course: { skills: unknown; adaptive: unknown },
  courseItems: { type: string; config: unknown }[]
): CheckpointPlacement | null {
  const c = checkpointConfig(item)
  if (!c) return null
  const skills = parseSkills(course.skills)
  if (!c.generated)
    return {
      bankSlug: c.bank,
      refs: c.tasks.map((t) => t.ref),
      title: item.title,
      scenario: c.scenario,
      diagnostic: c.diagnostic,
      // A diagnostic stops asking about a skill after the first miss.
      ...(c.diagnostic ? { groups: groupsOf(c.tasks) } : {}),
      practice: null,
    }
  const evidenceRefs = courseItems.flatMap((i) => {
    const other = checkpointConfig(i)
    return other && !other.generated && other.bank === c.bank
      ? other.tasks.filter((t) => t.skill === c.generated).map((t) => t.ref)
      : []
  })
  return {
    bankSlug: c.bank,
    refs: [],
    title: item.title,
    scenario: c.scenario,
    diagnostic: false,
    practice: {
      skill: skills.find((s) => s.id === c.generated)?.label ?? c.generated,
      evidenceRefs: [...new Set(evidenceRefs)],
      review: adaptiveRules(course.adaptive).approveGenerated,
    },
  }
}
