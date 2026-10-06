import { BadRequestException } from '@nestjs/common'
import { DEFAULT_ATTEMPTS } from './interview-scoring'
import { ALLOWED_LINK_SITES, parseExternalLink } from './external-link'
import { isImageKey } from './item-image'
import { parseYouTube } from './youtube'
import type { CourseItemType, CourseStatus, ItemInput, KnowledgeCheckQuestion } from './learn-types'

export const ITEM_TYPES: CourseItemType[] = [
  'lesson',
  'knowledge_check',
  'assessment',
  'interview',
  'scorm',
  'video',
  'external_link',
]

export interface CourseFields {
  title?: string
  summary?: string | null
  sector?: string | null
  credential?: string | null
  lengthWeeks?: number | null
  targetScore?: number
  readinessThreshold?: number
  outcomes?: string[]
  targetRoles?: string[]
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
  for (const key of ['outcomes', 'targetRoles'] as const) {
    if (input[key] !== undefined) {
      out[key] = lines(input[key], key === 'outcomes' ? 'Outcomes' : 'Target jobs', 8, 160)
    }
  }
  if (input.status !== undefined) {
    if (input.status !== 'draft' && input.status !== 'published') {
      return bad('Status must be draft or published')
    }
    out.status = input.status
  }
  return out
}

/** A short list of text lines (outcomes, jobs). Blank lines are dropped. */
function lines(v: unknown, field: string, max: number, maxLen: number): string[] {
  if (!Array.isArray(v) || v.length > max * 4) return bad(`${field} must be a short list`)
  const out = v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
  if (out.length > max) return bad(`${field}: up to ${max}`)
  if (out.some((x) => x.length > maxLen))
    return bad(`${field}: each line up to ${maxLen} characters`)
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
    case 'video': {
      const link = text(config.url ?? config.videoId, 'Video link', 300, true) as string
      const video = parseYouTube(link)
      if (!video) return bad('Paste a YouTube video link, for example https://youtu.be/…')
      const startSeconds = whole(config.startSeconds, 'Start time', 0, 86400) ?? video.startSeconds
      return {
        type,
        title,
        label,
        config: {
          provider: 'youtube',
          videoId: video.videoId,
          ...(startSeconds ? { startSeconds } : {}),
        },
      }
    }
    case 'external_link': {
      const link = parseExternalLink(text(config.url, 'Link', 500, true))
      if (!link)
        return bad(`Link to a page on one of: ${ALLOWED_LINK_SITES.join(', ')} (https only)`)
      const summary = text(config.summary, 'About this course', 600)
      const instructions = text(config.instructions, 'Instructions', 1000)
      return {
        type,
        title,
        label,
        config: {
          url: link.url,
          ...(summary ? { summary } : {}),
          ...(instructions ? { instructions } : {}),
          // Only a key this app wrote is kept, so a saved item cannot point at someone else's image.
          ...(isImageKey(config.imageKey) ? { imageKey: config.imageKey } : {}),
        },
      }
    }
    case 'interview': {
      const role = text(config.role, 'Role', 120) ?? ''
      const raw = config.questions ?? []
      if (!Array.isArray(raw) || raw.length > 6)
        return bad('A practice interview has up to 6 questions')
      const questions = raw.map((q, i) => text(q, `Question ${i + 1}`, 300, true) as string)
      const maxAttempts = whole(config.maxAttempts, 'Attempts', 1, 5) ?? DEFAULT_ATTEMPTS
      return { type, title, label, config: { role, questions, maxAttempts } }
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
