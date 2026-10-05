import { BadRequestException } from '@nestjs/common'
import type { CourseItemType, CourseStatus, ItemInput, KnowledgeCheckQuestion } from '@id/types'

export const ITEM_TYPES: CourseItemType[] = [
  'lesson',
  'knowledge_check',
  'assessment',
  'interview',
  'scorm',
]

export interface CourseFields {
  title?: string
  summary?: string | null
  sector?: string | null
  credential?: string | null
  lengthWeeks?: number | null
  targetScore?: number
  readinessThreshold?: number
  status?: CourseStatus
}

const bad = (msg: string): never => {
  throw new BadRequestException(msg)
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function text(v: unknown, field: string, max: number, required = false): string | null | undefined {
  if (v === undefined) return required ? bad(`${field} is required`) : undefined
  if (v === null || v === '') return required ? bad(`${field} is required`) : null
  if (typeof v !== 'string') return bad(`${field} must be text`)
  const t = v.trim()
  if (!t && required) return bad(`${field} is required`)
  if (t.length > max) return bad(`${field} is too long (max ${max})`)
  return t || null
}

function whole(v: unknown, field: string, min: number, max: number): number | undefined {
  if (v === undefined) return undefined
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    return bad(`${field} must be a whole number from ${min} to ${max}`)
  }
  return v
}

/** Course settings from a request body. `partial` allows leaving fields out (updates). */
export function validateCourseFields(input: unknown, partial: boolean): CourseFields {
  if (!isObject(input)) return bad('Body must be an object')
  const out: CourseFields = {}
  const title = text(input.title, 'Title', 120, !partial)
  if (title !== undefined) out.title = title as string
  const summary = text(input.summary, 'Summary', 500)
  if (summary !== undefined) out.summary = summary
  const sector = text(input.sector, 'Sector', 60)
  if (sector !== undefined) out.sector = sector
  const credential = text(input.credential, 'Credential', 80)
  if (credential !== undefined) out.credential = credential
  if (input.lengthWeeks === null) out.lengthWeeks = null
  else {
    const weeks = whole(input.lengthWeeks, 'Length in weeks', 1, 104)
    if (weeks !== undefined) out.lengthWeeks = weeks
  }
  const target = whole(input.targetScore, 'Target score', 0, 100)
  if (target !== undefined) out.targetScore = target
  const ready = whole(input.readinessThreshold, 'Readiness threshold', 0, 100)
  if (ready !== undefined) out.readinessThreshold = ready
  if (input.status !== undefined) {
    if (input.status !== 'draft' && input.status !== 'published') {
      return bad('Status must be draft or published')
    }
    out.status = input.status
  }
  return out
}

function validateQuestions(v: unknown): KnowledgeCheckQuestion[] {
  if (!Array.isArray(v) || v.length > 20) return bad('Questions must be a list of up to 20')
  return v.map((q, i) => {
    if (!isObject(q)) return bad(`Question ${i + 1} is not valid`)
    const prompt = text(q.prompt, `Question ${i + 1}`, 300, true) as string
    const opts = q.options
    if (!Array.isArray(opts) || opts.length < 2 || opts.length > 6) {
      return bad(`Question ${i + 1} needs 2 to 6 answers`)
    }
    const options = opts.map(
      (o, j) => text(o, `Answer ${j + 1} of question ${i + 1}`, 200, true) as string
    )
    const correctIndex = whole(
      q.correctIndex,
      `Correct answer of question ${i + 1}`,
      0,
      options.length - 1
    )
    if (correctIndex === undefined) return bad(`Question ${i + 1} needs a correct answer`)
    return { prompt, options, correctIndex }
  })
}

/** Item fields from a request body, with the config checked for its type. */
export function validateItemInput(input: unknown): Required<Pick<ItemInput, 'type' | 'title'>> & {
  label: 'pre' | 'post' | null
  config: Record<string, unknown>
} {
  if (!isObject(input)) return bad('Body must be an object')
  const type = input.type as CourseItemType
  if (!ITEM_TYPES.includes(type)) return bad(`Type must be one of ${ITEM_TYPES.join(', ')}`)
  const title = text(input.title, 'Title', 120, true) as string
  const config = input.config === undefined ? {} : input.config
  if (!isObject(config)) return bad('Config must be an object')

  let label: 'pre' | 'post' | null = null
  if (type === 'assessment') {
    if (input.label !== 'pre' && input.label !== 'post')
      return bad('An assessment is either pre or post')
    label = input.label
  }

  switch (type) {
    case 'lesson':
      return { type, title, label, config: { body: text(config.body, 'Lesson text', 20000) ?? '' } }
    case 'knowledge_check':
      return {
        type,
        title,
        label,
        config: { questions: validateQuestions(config.questions ?? []) },
      }
    case 'assessment': {
      const slug = text(config.assessmentSlug, 'Assessment', 120)
      return {
        type,
        title,
        label,
        config: {
          questions: validateQuestions(config.questions ?? []),
          ...(slug ? { assessmentSlug: slug } : {}),
        },
      }
    }
    case 'scorm': {
      const packageId = text(config.packageId, 'Package', 60, true) as string
      if (!/^[0-9a-f-]{36}$/.test(packageId)) return bad('That is not a valid package')
      const entry = text(config.entry, 'Launch file', 300, true) as string
      if (config.version !== '1.2' && config.version !== '2004') return bad('Unknown SCORM version')
      return {
        type,
        title,
        label,
        config: {
          packageId,
          entry,
          version: config.version,
          files: whole(config.files, 'Files', 0, 100000) ?? 0,
        },
      }
    }
    case 'interview':
      return {
        type,
        title,
        label,
        config: { scenarioId: text(config.scenarioId, 'Scenario', 120) ?? '' },
      }
  }
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'course'
  )
}
