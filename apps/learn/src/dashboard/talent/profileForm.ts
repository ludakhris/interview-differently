import type { EducationLevel, TalentProfileDto, TalentProfileInput } from '@id/types'

export const EDUCATION_OPTIONS: { value: EducationLevel; label: string }[] = [
  { value: 'high_school', label: 'High school or equivalent' },
  { value: 'some_college', label: 'Some college' },
  { value: 'associate', label: "Associate's degree" },
  { value: 'bachelor', label: "Bachelor's degree" },
  { value: 'master', label: "Master's degree" },
  { value: 'doctorate', label: 'Doctorate' },
  { value: 'other', label: 'Something else' },
]
export const educationLabel = (v: string | null): string =>
  EDUCATION_OPTIONS.find((o) => o.value === v)?.label ?? '—'

export const MAX_COMPENSATION = 10_000_000
export const MAX_RESUME_BYTES = 5 * 1024 * 1024

/** Everything the form holds, as the text in each box. */
export interface FormValues {
  educationLevel: string
  fieldOfStudy: string
  school: string
  graduationYear: string
  yearsExperience: string
  industries: string
  targetRoles: string
  previousCompensation: string
  targetCompensation: string
  availableFrom: string
  shareWithEmployers: boolean
}

export const emptyValues: FormValues = {
  educationLevel: '',
  fieldOfStudy: '',
  school: '',
  graduationYear: '',
  yearsExperience: '',
  industries: '',
  targetRoles: '',
  previousCompensation: '',
  targetCompensation: '',
  availableFrom: '',
  shareWithEmployers: false,
}

export const toValues = (p: TalentProfileDto | null): FormValues =>
  p
    ? {
        educationLevel: p.educationLevel ?? '',
        fieldOfStudy: p.fieldOfStudy ?? '',
        school: p.school ?? '',
        graduationYear: p.graduationYear === null ? '' : String(p.graduationYear),
        yearsExperience: p.yearsExperience === null ? '' : String(p.yearsExperience),
        industries: p.industries.join(', '),
        targetRoles: p.targetRoles.join(', '),
        previousCompensation: p.previousCompensation === null ? '' : String(p.previousCompensation),
        targetCompensation: p.targetCompensation === null ? '' : String(p.targetCompensation),
        availableFrom: p.availableFrom ?? '',
        shareWithEmployers: p.shareWithEmployers,
      }
    : emptyValues

/** "IT, Health care" -> ["IT", "Health care"]; blanks and repeats are dropped. */
export function splitList(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of text.split(/[,\n;]/)) {
    const t = part.trim()
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase())
      out.push(t)
    }
  }
  return out
}

/** "$85,000" -> 85000. Null when empty, NaN when it is not a whole number of dollars. */
export function parseMoney(text: string): number | null {
  const t = text.replace(/[\s$,]/g, '')
  if (t === '') return null
  return /^\d+$/.test(t) ? Number(t) : Number.NaN
}

export type FieldErrors = Partial<Record<keyof FormValues | 'finish', string>>

const whole = (text: string): number | null => {
  const t = text.trim()
  if (t === '') return null
  return /^\d+$/.test(t) ? Number(t) : Number.NaN
}

/** Errors by field, in plain words. Empty means the form can be saved. `complete` adds the finish rules. */
export function validate(v: FormValues, complete: boolean): FieldErrors {
  const e: FieldErrors = {}
  const years = whole(v.yearsExperience)
  if (years !== null && !(years >= 0 && years <= 60))
    e.yearsExperience = 'Enter a whole number of years from 0 to 60.'
  const grad = whole(v.graduationYear)
  if (grad !== null && !(grad >= 1950 && grad <= 2100))
    e.graduationYear = 'Enter a four-digit year, such as 2019.'
  for (const k of ['previousCompensation', 'targetCompensation'] as const) {
    const m = parseMoney(v[k])
    if (m !== null && !(m >= 0 && m <= MAX_COMPENSATION))
      e[k] = 'Enter whole dollars per year, from 0 to 10,000,000.'
  }
  for (const k of ['fieldOfStudy', 'school'] as const)
    if (v[k].trim().length > 200) e[k] = 'Keep this under 200 characters.'
  for (const k of ['industries', 'targetRoles'] as const) {
    const list = splitList(v[k])
    if (list.length > 20) e[k] = 'Add 20 or fewer, separated by commas.'
    else if (list.some((x) => x.length > 80)) e[k] = 'Keep each one under 80 characters.'
  }
  if (v.availableFrom && Number.isNaN(Date.parse(v.availableFrom)))
    e.availableFrom = 'Choose a real date.'
  if (complete) {
    const missing: string[] = []
    if (!v.educationLevel) {
      missing.push('your education level')
      e.educationLevel = 'Choose your highest level of education.'
    }
    if (v.yearsExperience.trim() === '') missing.push('your years of experience')
    if (splitList(v.industries).length === 0 && splitList(v.targetRoles).length === 0)
      missing.push('at least one industry or target role')
    if (missing.length) e.finish = `To finish, add ${missing.join(', ')}.`
  }
  return e
}

export function toInput(v: FormValues, complete: boolean): TalentProfileInput {
  return {
    educationLevel: (v.educationLevel || null) as EducationLevel | null,
    fieldOfStudy: v.fieldOfStudy.trim() || null,
    school: v.school.trim() || null,
    graduationYear: whole(v.graduationYear),
    yearsExperience: whole(v.yearsExperience),
    industries: splitList(v.industries),
    targetRoles: splitList(v.targetRoles),
    previousCompensation: parseMoney(v.previousCompensation),
    targetCompensation: parseMoney(v.targetCompensation),
    availableFrom: v.availableFrom || null,
    shareWithEmployers: v.shareWithEmployers,
    ...(complete ? { complete: true } : {}),
  }
}

export const money = (n: number | null): string =>
  n === null ? 'Not given' : `$${n.toLocaleString('en-US')} a year`

export function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Returns why a chosen file cannot be a resume, or null. The server checks the file's contents again. */
export function resumeProblem(file: { name: string; size: number }): string | null {
  if (!/\.(pdf|doc|docx)$/i.test(file.name)) return 'Choose a PDF, DOC or DOCX file.'
  if (file.size > MAX_RESUME_BYTES) return 'That file is over 5 MB. Choose a smaller one.'
  if (file.size === 0) return 'That file is empty.'
  return null
}
