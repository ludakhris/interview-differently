import { parseAssessmentMarkdown } from '../assessments/parse-markdown'
import type { ParsedAssessment } from '../assessments/assessment.types'

/**
 * Moves a native LearnDifferently pre/post assessment (inline multiple-choice questions on a
 * `CourseItem`) onto an Interview Differently assessment bank. The bank is written as the
 * markdown an admin would import and read back through the real parser, so what is stored is
 * exactly what an import would store (docs/assessment-format.md).
 */

/** A native question as stored on an `assessment` item (see KnowledgeCheckQuestion). */
export interface LegacyQuestion {
  id?: string
  prompt: string
  options: string[]
  correctIndex: number
  skill?: string
}

/** One line of text: the markdown parser reads structure from line starts, so nothing may wrap. */
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

const isQuestion = (v: unknown): v is LegacyQuestion => {
  if (typeof v !== 'object' || v === null) return false
  const q = v as Record<string, unknown>
  return (
    typeof q.prompt === 'string' &&
    Array.isArray(q.options) &&
    q.options.every((o) => typeof o === 'string') &&
    typeof q.correctIndex === 'number'
  )
}

/** The inline questions of an item's config, or null when there are none. */
export function legacyQuestions(config: unknown): LegacyQuestion[] | null {
  const raw =
    typeof config === 'object' && config !== null
      ? (config as Record<string, unknown>).questions
      : undefined
  if (!Array.isArray(raw) || raw.length === 0) return null
  return raw.every(isQuestion) ? raw : null
}

/**
 * The assessment markdown for a bank of multiple-choice questions: one section, every question
 * drawn. Prompts and options are collapsed to a single line each, so text that looks like markup
 * (a line starting `A)`, `**Answer:`, `> draw:` or `## Section`) can never be read as structure:
 * the parser only reads those at the start of a line, and a prompt shares the line of its number.
 */
export function questionsToMarkdown(
  slug: string,
  title: string,
  questions: LegacyQuestion[]
): string {
  const lines = [
    '---',
    // JSON strings are valid YAML double-quoted scalars, so any title survives.
    `slug: ${JSON.stringify(slug)}`,
    `title: ${JSON.stringify(oneLine(title) || 'Assessment')}`,
    '---',
    '',
    '## Section 1: Assessment',
    '',
  ]
  questions.forEach((q, i) => {
    lines.push(`**1.${i + 1} (MC)** ${oneLine(q.prompt)}`)
    q.options.forEach((o, j) => lines.push(`${String.fromCharCode(65 + j)}) ${oneLine(o)}`))
    lines.push(`**Answer: ${String.fromCharCode(65 + q.correctIndex)}**`, '')
  })
  return lines.join('\n')
}

export const migratedSlug = (itemId: string): string => `ld-${itemId}`

export type ItemPlan =
  | {
      ok: true
      slug: string
      markdown: string
      parsed: ParsedAssessment
      questionCount: number
      skills: string[]
    }
  | { ok: false; reason: string }

/**
 * What converting one native assessment item would create, or why it cannot be converted. The
 * slug is `ld-<itemId>` unless given (the demo seed names its banks itself).
 */
export function planItem(
  item: { id: string; title: string; config: unknown },
  slug: string = migratedSlug(item.id)
): ItemPlan {
  const questions = legacyQuestions(item.config)
  if (!questions) return { ok: false, reason: 'no inline questions (or they are malformed)' }
  for (const [i, q] of questions.entries()) {
    if (q.options.length < 2 || q.options.length > 26 || q.options.some((o) => !oneLine(o))) {
      return { ok: false, reason: `question ${i + 1} has fewer than two usable answers` }
    }
    if (
      !Number.isInteger(q.correctIndex) ||
      q.correctIndex < 0 ||
      q.correctIndex >= q.options.length
    ) {
      return { ok: false, reason: `question ${i + 1} has a correct answer outside its options` }
    }
    if (!oneLine(q.prompt)) return { ok: false, reason: `question ${i + 1} has no text` }
  }
  const markdown = questionsToMarkdown(slug, item.title, questions)
  const parsed = parseAssessmentMarkdown(markdown)
  const skills = [...new Set(questions.flatMap((q) => (q.skill ? [q.skill] : [])))]
  return { ok: true, slug, markdown, parsed, questionCount: questions.length, skills }
}

/** The item config after conversion: the tool item that launches the migrated bank. */
export const toolConfig = (slug: string): Record<string, unknown> => ({
  toolId: 'id-assessment',
  ref: slug,
  maxAttempts: 1,
})
