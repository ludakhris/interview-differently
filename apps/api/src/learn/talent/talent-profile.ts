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

export const MAX_EDUCATIONS = 8
export const MAX_SHARES = 100

export interface EducationWrite {
  level: EducationLevel
  fieldOfStudy: string | null
  school: string | null
  graduationYear: number | null
}

/**
 * What a valid save changes, ready for the database. Only what the request named is present: a
 * field left out is left as is. Error messages never repeat what was typed, so an amount cannot
 * leak through a message.
 */
export interface ProfileWrite {
  data: {
    yearsExperience?: number | null
    industries?: string[]
    previousCompensation?: number | null
    targetCompensation?: number | null
    targetRoles?: string[]
    availableFrom?: Date | null
  }
  /** The complete list wanted, in order. */
  educations?: EducationWrite[]
  /** The complete set of organizations to show the profile to. */
  shares?: { institutionId: string; allowEmployers: boolean }[]
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

function educations(v: unknown): EducationWrite[] {
  if (!Array.isArray(v)) throw new BadRequestException('Education must be a list')
  if (v.length > MAX_EDUCATIONS)
    throw new BadRequestException(`You can list at most ${MAX_EDUCATIONS} schools or programs`)
  return v.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new BadRequestException('Each education entry must be an object')
    const e = raw as Record<string, unknown>
    if (!EDUCATION_LEVELS.includes(e.level as EducationLevel))
      throw new BadRequestException('Choose an education level for each entry')
    return {
      level: e.level as EducationLevel,
      fieldOfStudy: has(e, 'fieldOfStudy') ? text(e.fieldOfStudy, 'Field of study') : null,
      school: has(e, 'school') ? text(e.school, 'School') : null,
      graduationYear: has(e, 'graduationYear')
        ? integer(e.graduationYear, 'Graduation year', 1950, 2100)
        : null,
    }
  })
}

function shares(v: unknown): { institutionId: string; allowEmployers: boolean }[] {
  if (!Array.isArray(v)) throw new BadRequestException('Sharing must be a list')
  if (v.length > MAX_SHARES) throw new BadRequestException('Too many organizations')
  const out = new Map<string, boolean>()
  for (const raw of v) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new BadRequestException('Each sharing choice must be an object')
    const s = raw as Record<string, unknown>
    if (typeof s.institutionId !== 'string' || !s.institutionId)
      throw new BadRequestException('Each sharing choice needs an organization')
    if (typeof s.allowEmployers !== 'boolean')
      throw new BadRequestException('Sharing with employers must be yes or no')
    out.set(s.institutionId, s.allowEmployers)
  }
  return [...out].map(([institutionId, allowEmployers]) => ({ institutionId, allowEmployers }))
}

export function parseProfileInput(body: unknown): ProfileWrite {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new BadRequestException('Send your profile as a JSON object')
  const b = body as Record<string, unknown>
  const data: ProfileWrite['data'] = {}
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
  return {
    data,
    ...(has(b, 'educations') ? { educations: educations(b.educations) } : {}),
    ...(has(b, 'shares') ? { shares: shares(b.shares) } : {}),
  }
}
