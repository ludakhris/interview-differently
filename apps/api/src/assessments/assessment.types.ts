/**
 * Parsed assessment shapes (#25). Stored as JSON on Assessment.sections and
 * mirrored in packages/types for the frontend.
 */

export interface McOption {
  key: string // 'A' | 'B' | ...
  text: string
}

export interface McQuestion {
  id: string // '1.1' — unique within the assessment
  type: 'mc'
  prompt: string
  options: McOption[]
  answer: string // option key
}

export interface SqlQuestion {
  id: string
  type: 'sql'
  prompt: string
  referenceSql: string
  starterSql?: string // optional example query the student starts from
  ordered: boolean // row order must match
  strictColumns: boolean // column names must match
}

export type AssessmentQuestion = McQuestion | SqlQuestion

/** Questions drawn per section: a total of any type, or per-type counts keyed by AssessmentQuestion.type. */
export type DrawSpec = number | Record<string, number>

export interface AssessmentSection {
  id: string // 's1'
  number: number
  title: string
  draw: DrawSpec | null // questions to draw per delivery; null = all
  questions: AssessmentQuestion[]
}

export interface ParsedAssessment {
  slug: string
  title: string
  dataset: string // Dataset.slug
  defaultDraw: DrawSpec | null
  sections: AssessmentSection[]
  warnings: string[]
}

export interface SectionScore {
  sectionId: string
  title: string
  correct: number
  total: number
  // Per-question outcome, in paper order. Kept for the admin view; the
  // student result endpoint strips it so the bank isn't revealed.
  questions: { id: string; type: 'mc' | 'sql'; correct: boolean; error?: string }[]
}
