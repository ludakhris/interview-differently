import type {
  EducationLevel,
  LearnerProfileState,
  ProfileDto,
  ProfileInput,
  ProfileRequirement,
} from '@id/types'

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

export const INDUSTRY_SUGGESTIONS = [
  'Healthcare',
  'Information technology',
  'Retail',
  'Manufacturing',
  'Construction',
  'Hospitality',
  'Food service',
  'Transportation and logistics',
  'Education',
  'Finance',
  'Government',
  'Aerospace',
]
export const ROLE_SUGGESTIONS = [
  'Data analyst',
  'Project coordinator',
  'Administrative assistant',
  'Customer service',
  'Software developer',
  'IT support',
  'Technician',
  'Sales',
]

export const MAX_COMPENSATION = 10_000_000
export const MAX_RESUME_BYTES = 5 * 1024 * 1024
export const MAX_EDUCATIONS = 8
export const MAX_LIST = 20

export interface EducationValues {
  /** Only for React keys; never sent. */
  key: string
  level: string
  fieldOfStudy: string
  school: string
  graduationYear: string
}

export interface ShareChoice {
  shared: boolean
  allowEmployers: boolean
}

/** Everything the form holds. Numbers are the text in each box; lists are real arrays. */
export interface FormValues {
  yearsExperience: string
  industries: string[]
  targetRoles: string[]
  availableFrom: string
  previousCompensation: string
  targetCompensation: string
  educations: EducationValues[]
  /** By institution id. */
  shares: Record<string, ShareChoice>
}

let counter = 0
export const blankEducation = (): EducationValues => ({
  key: `edu-${++counter}`,
  level: '',
  fieldOfStudy: '',
  school: '',
  graduationYear: '',
})

const text = (n: number | null): string => (n === null ? '' : String(n))

export function toValues(state: LearnerProfileState): FormValues {
  const p = state.profile
  return {
    yearsExperience: text(p.yearsExperience),
    industries: [...p.industries],
    targetRoles: [...p.targetRoles],
    availableFrom: p.availableFrom ?? '',
    previousCompensation: formatMoney(text(p.previousCompensation)),
    targetCompensation: formatMoney(text(p.targetCompensation)),
    educations: p.educations.length
      ? p.educations.map((e) => ({
          key: `edu-${++counter}`,
          level: e.level,
          fieldOfStudy: e.fieldOfStudy ?? '',
          school: e.school ?? '',
          graduationYear: text(e.graduationYear),
        }))
      : [blankEducation()],
    shares: Object.fromEntries(
      state.organizations.map((o) => [
        o.institutionId,
        { shared: o.shared, allowEmployers: o.shared },
      ])
    ),
  }
}

/** Adds typed items to a list: blanks and repeats are dropped, order is kept. */
export function addItems(list: string[], raw: string[]): string[] {
  const seen = new Set(list.map((x) => x.toLowerCase()))
  const out = [...list]
  for (const part of raw) {
    const t = part.trim()
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase())
      out.push(t)
    }
  }
  return out
}

/** "$85,000" or "85,000.00" -> 85000. Null when empty, NaN when it is not a whole number of dollars. */
export function parseMoney(value: string): number | null {
  const t = value.replace(/[\s$,]/g, '').replace(/\.0*$/, '')
  if (t === '') return null
  return /^\d+$/.test(t) ? Number(t) : Number.NaN
}

/** "85000" -> "85,000". Anything that is not whole dollars is left as typed so the error can show. */
export function formatMoney(value: string): string {
  const n = parseMoney(value)
  return n === null || Number.isNaN(n) ? value : n.toLocaleString('en-US')
}

/** "2:14 pm", for the save bar. */
export const timeShort = (d: Date): string =>
  d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .replace(/\s/g, ' ')
    .toLowerCase()

const whole = (value: string): number | null => {
  const t = value.trim()
  if (t === '') return null
  return /^\d+$/.test(t) ? Number(t) : Number.NaN
}

/** Errors by field key (for example `yearsExperience` or `education.1.level`), in plain words. */
export type FieldErrors = Record<string, string>

export const educationBlank = (e: EducationValues) =>
  !e.level && !e.fieldOfStudy.trim() && !e.school.trim() && !e.graduationYear.trim()

/** Entries the person actually filled in; a blank row is just the empty starting row. */
export const filledEducations = (v: FormValues) => v.educations.filter((e) => !educationBlank(e))

export function validate(v: FormValues): FieldErrors {
  const e: FieldErrors = {}
  const years = whole(v.yearsExperience)
  if (years !== null && !(years >= 0 && years <= 60))
    e.yearsExperience = 'Enter a whole number of years from 0 to 60.'
  for (const k of ['previousCompensation', 'targetCompensation'] as const) {
    const m = parseMoney(v[k])
    if (m !== null && !(m >= 0 && m <= MAX_COMPENSATION))
      e[k] = 'Enter whole dollars per year, from 0 to 10,000,000.'
  }
  for (const k of ['industries', 'targetRoles'] as const) {
    if (v[k].length > MAX_LIST) e[k] = `Keep this to ${MAX_LIST} or fewer.`
    else if (v[k].some((x) => x.length > 80)) e[k] = 'Keep each one under 80 characters.'
  }
  if (v.availableFrom && Number.isNaN(Date.parse(v.availableFrom)))
    e.availableFrom = 'Choose a real date.'
  v.educations.forEach((ed, i) => {
    if (educationBlank(ed)) return
    if (!ed.level) e[`education.${i}.level`] = 'Choose a level for this entry.'
    const grad = whole(ed.graduationYear)
    if (grad !== null && !(grad >= 1950 && grad <= 2100))
      e[`education.${i}.graduationYear`] = 'Enter a four-digit year, such as 2019.'
    for (const k of ['fieldOfStudy', 'school'] as const)
      if (ed[k].trim().length > 200) e[`education.${i}.${k}`] = 'Keep this under 200 characters.'
  })
  if (filledEducations(v).length > MAX_EDUCATIONS)
    e['education'] = `Add ${MAX_EDUCATIONS} or fewer.`
  return e
}

export function toInput(v: FormValues): ProfileInput {
  return {
    yearsExperience: whole(v.yearsExperience),
    industries: v.industries,
    targetRoles: v.targetRoles,
    availableFrom: v.availableFrom || null,
    previousCompensation: parseMoney(v.previousCompensation),
    targetCompensation: parseMoney(v.targetCompensation),
    educations: filledEducations(v).map((e) => ({
      level: e.level as EducationLevel,
      fieldOfStudy: e.fieldOfStudy.trim() || null,
      school: e.school.trim() || null,
      graduationYear: whole(e.graduationYear),
    })),
    shares: Object.entries(v.shares)
      .filter(([, c]) => c.shared)
      .map(([institutionId]) => ({ institutionId, allowEmployers: true })),
  }
}

export interface Check {
  label: string
  done: boolean
}

/**
 * What makes a profile complete, as the person has filled it in so far. Mirrors the server rule.
 * The resume is not a form field: it is uploaded on its own, so it comes from the live state.
 */
export function checklist(v: FormValues, hasResume: boolean): Check[] {
  return [
    { label: 'an education entry', done: v.educations.some((e) => !!e.level) },
    { label: 'your years of experience', done: whole(v.yearsExperience) !== null },
    { label: 'at least one industry', done: v.industries.length > 0 },
    { label: 'at least one job you want', done: v.targetRoles.length > 0 },
    { label: 'a resume', done: hasResume },
  ]
}

/** What is missing from the SAVED profile. */
export function missingFromSaved(p: ProfileDto): string[] {
  const out: string[] = []
  if (p.educations.length === 0) out.push('an education entry')
  if (p.yearsExperience === null) out.push('your years of experience')
  if (p.industries.length === 0) out.push('an industry')
  if (p.targetRoles.length === 0) out.push('a job you want')
  if (!p.resume) out.push('a resume')
  return out
}

/**
 * One plain line for a requirement that is not met, or null when it is met (nothing is shown for
 * a met one). It never names the organization. `fmt` formats an ISO time as a date.
 */
export function requirementText(
  r: ProfileRequirement,
  profile: ProfileDto,
  fmt: (iso: string) => string
): string | null {
  if (r.satisfied) return null
  if (profile.complete)
    return r.dueBy
      ? `Time to refresh your profile: it is due ${fmt(r.dueBy)}.`
      : 'Time to refresh your profile.'
  return 'Your course needs your profile: finish it.'
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
