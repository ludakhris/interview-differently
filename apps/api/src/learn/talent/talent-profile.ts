import { BadRequestException } from '@nestjs/common'
import type { EducationLevel } from '../talent-types'

export const EDUCATION_LEVELS: EducationLevel[] = [
  'high_school',
  'some_college',
  'associate',
  'bachelor',
  'master',
  'doctorate',
  'other',
]
export const MAX_COMPENSATION = 10_000_000
export const MAX_YEARS = 60
export const MAX_TEXT = 200
export const MAX_LIST = 20
export const MAX_LIST_ENTRY = 80

/**
 * What a valid save changes, ready for the database. Only the fields the request named are present.
 * Error messages never repeat what was typed, so an amount cannot leak through a message.
 */
export interface ProfilePatch {
  data: {
    educationLevel?: EducationLevel | null
    fieldOfStudy?: string | null
    school?: string | null
    graduationYear?: number | null
    yearsExperience?: number | null
    industries?: string[]
    previousCompensation?: number | null
    targetCompensation?: number | null
    targetRoles?: string[]
    availableFrom?: Date | null
    shareWithEmployers?: boolean
  }
  complete: boolean
}

const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k)

function integer(v: unknown, label: string, min: number, max: number): number | null {
  if (v === null || v === '') return null
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max)
    throw new BadRequestException(
      `${label} must be a whole number from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}`
    )
  return v
}

function text(v: unknown, label: string): string | null {
  if (v === null) return null
  if (typeof v !== 'string') throw new BadRequestException(`${label} must be text`)
  const t = v.trim()
  if (t.length > MAX_TEXT)
    throw new BadRequestException(`${label} must be at most ${MAX_TEXT} characters`)
  return t || null
}

function list(v: unknown, label: string): string[] {
  if (!Array.isArray(v)) throw new BadRequestException(`${label} must be a list`)
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of v) {
    if (typeof raw !== 'string') throw new BadRequestException(`${label} must be a list of text`)
    const t = raw.trim()
    if (!t) continue
    if (t.length > MAX_LIST_ENTRY)
      throw new BadRequestException(
        `Each entry in ${label} must be at most ${MAX_LIST_ENTRY} characters`
      )
    if (seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    out.push(t)
  }
  if (out.length > MAX_LIST)
    throw new BadRequestException(`${label} can have at most ${MAX_LIST} entries`)
  return out
}

/** A real calendar day (YYYY-MM-DD) as UTC midnight, or null. */
export function parseDay(v: unknown, label: string): Date | null {
  if (v === null || v === '') return null
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v))
    throw new BadRequestException(`${label} must be a date (YYYY-MM-DD)`)
  const d = new Date(`${v}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v)
    throw new BadRequestException(`${label} is not a real date`)
  return d
}

export function parseProfileInput(body: unknown): ProfilePatch {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new BadRequestException('Send your profile as a JSON object')
  const b = body as Record<string, unknown>
  const data: ProfilePatch['data'] = {}
  if (has(b, 'educationLevel')) {
    const v = b.educationLevel
    if (v !== null && !EDUCATION_LEVELS.includes(v as EducationLevel))
      throw new BadRequestException('Choose an education level from the list')
    data.educationLevel = v as EducationLevel | null
  }
  if (has(b, 'fieldOfStudy')) data.fieldOfStudy = text(b.fieldOfStudy, 'Field of study')
  if (has(b, 'school')) data.school = text(b.school, 'School')
  if (has(b, 'graduationYear'))
    data.graduationYear = integer(b.graduationYear, 'Graduation year', 1950, 2100)
  if (has(b, 'yearsExperience'))
    data.yearsExperience = integer(b.yearsExperience, 'Years of experience', 0, MAX_YEARS)
  if (has(b, 'industries')) data.industries = list(b.industries, 'Industries')
  if (has(b, 'targetRoles')) data.targetRoles = list(b.targetRoles, 'Target roles')
  if (has(b, 'previousCompensation'))
    data.previousCompensation = integer(
      b.previousCompensation,
      'Previous pay (whole dollars per year)',
      0,
      MAX_COMPENSATION
    )
  if (has(b, 'targetCompensation'))
    data.targetCompensation = integer(
      b.targetCompensation,
      'Target pay (whole dollars per year)',
      0,
      MAX_COMPENSATION
    )
  if (has(b, 'availableFrom')) data.availableFrom = parseDay(b.availableFrom, 'Available from')
  if (has(b, 'shareWithEmployers')) {
    if (typeof b.shareWithEmployers !== 'boolean')
      throw new BadRequestException('Sharing must be yes or no')
    data.shareWithEmployers = b.shareWithEmployers
  }
  if (has(b, 'complete') && typeof b.complete !== 'boolean')
    throw new BadRequestException('complete must be true or false')
  return { data, complete: b.complete === true }
}

/** What a profile needs before it can be marked complete. Returns the reason, or null when it is enough. */
export function incompleteReason(p: {
  educationLevel: string | null
  yearsExperience: number | null
  industries: string[]
  targetRoles: string[]
}): string | null {
  const missing: string[] = []
  if (!p.educationLevel) missing.push('your education level')
  if (p.yearsExperience === null) missing.push('your years of experience')
  if (p.industries.length === 0 && p.targetRoles.length === 0)
    missing.push('at least one industry or target role')
  return missing.length ? `To finish, add ${missing.join(', ')}.` : null
}
