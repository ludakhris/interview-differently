import { isReady, type EnrollmentRow } from './outcomes'

const COLUMNS = [
  'participant_id',
  'participant_name',
  'training_provider',
  'program',
  'credential',
  'cohort',
  'cohort_start',
  'cohort_end',
  'enrolled_status',
  'completion_date',
  'pre_assessment_score',
  'post_assessment_score',
  'score_change',
  'best_interview_score',
  'interview_ready',
  'items_completed',
  'items_total',
] as const

function cell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const day = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : '')

/**
 * Demo-grade exit file: one row per participant with completion and progress
 * documentation. It carries no wage-match identifiers (SSN, etc.); a real
 * state file would add the identifiers its reporting system expects (#50).
 */
export function exitFileCsv(rows: EnrollmentRow[]): string {
  const sorted = [...rows].sort(
    (a, b) =>
      a.providerName.localeCompare(b.providerName) ||
      a.cohortName.localeCompare(b.cohortName) ||
      (a.name ?? '').localeCompare(b.name ?? '')
  )
  const lines = sorted.map((r) =>
    [
      r.userId,
      r.name,
      r.providerName,
      r.program,
      r.credential,
      r.cohortName,
      day(r.startsAt),
      day(r.endsAt),
      r.status,
      day(r.completedAt),
      r.pre,
      r.post,
      r.pre !== null && r.post !== null ? r.post - r.pre : null,
      r.interviewBest,
      isReady(r) ? 'yes' : 'no',
      r.itemsDone,
      r.itemsTotal,
    ]
      .map(cell)
      .join(',')
  )
  return [COLUMNS.join(','), ...lines].join('\r\n') + '\r\n'
}
