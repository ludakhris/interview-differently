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
  ordered: boolean // row order must match
  strictColumns: boolean // column names must match
}

export type AssessmentQuestion = McQuestion | SqlQuestion

export interface AssessmentSection {
  id: string // 's1'
  number: number
  title: string
  draw: number | null // questions to draw per delivery; null = all
  questions: AssessmentQuestion[]
}

export interface ParsedAssessment {
  slug: string
  title: string
  dataset: string // Dataset.slug
  defaultDraw: number | null
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
