/**
 * Frontend client for assessments (#25).
 *
 * `/admin/assessments/*` + `/admin/deliveries/*` sit behind AdminGuard;
 * `/me/assessments`, `/me/deliveries/*`, `/me/attempts/*` behind
 * AuthenticatedGuard. All take `getToken` from `useAuth()`.
 */
import type { AssessmentSection, OverallScore, SectionScore, SectionScoreSummary, StudentQuestion } from '@id/types'
import type { SchemaTable } from './datasetsService'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export type GetToken = () => Promise<string | null>

async function authedFetch(getToken: GetToken, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken()
  if (!token) throw new Error('Not signed in')
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { message?: string | string[] }
      if (body.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message
    } catch {
      // not json — keep status text
    }
    throw new Error(message)
  }
  return res
}

// ── Admin ──────────────────────────────────────────────────────────────────

export interface AssessmentSummary {
  id: string
  slug: string
  title: string
  dataset: { slug: string; name: string }
  /** null = platform-wide (read-only for institution-admins) */
  institutionId: string | null
  institutionName: string | null
  sectionCount: number
  questionCount: number
  deliveryCount: number
  updatedAt: string
}

export interface DeliverySummary {
  id: string
  label: string
  /** null once the cohort was deleted — attempts/results are kept */
  cohort: { id: string; name: string; institutionName: string } | null
  opensAt: string | null
  closesAt: string | null
  timeLimitMinutes: number | null
  inviteCode: string | null
  createdAt: string
  startedCount: number
  submittedCount: number
}

export interface AssessmentDetail {
  id: string
  slug: string
  title: string
  dataset: { slug: string; name: string }
  institutionId: string | null
  institutionName: string | null
  defaultDraw: number | Record<string, number> | null
  sections: AssessmentSection[]
  sourceMarkdown: string
  updatedAt: string
  deliveries: DeliverySummary[]
}

export interface PreviewResult {
  parsed: { slug: string; title: string; dataset: string; defaultDraw: number | Record<string, number> | null; sections: AssessmentSection[]; warnings: string[] }
  datasetId: string
  datasetName: string
  sqlErrors: { questionId: string; error: string }[]
}

export interface DeliveryInput {
  cohortId: string
  label: string
  opensAt?: string | null
  closesAt?: string | null
  timeLimitMinutes?: number | null
}

export interface DeliveryResults {
  delivery: { id: string; label: string; cohortName: string | null; assessmentTitle: string }
  sections: { id: string; title: string }[]
  attempts: {
    attemptId: string
    userId: string
    email: string | null
    displayName: string | null
    startedAt: string
    submittedAt: string | null
    submittedLate: boolean
    sectionScores: SectionScore[] | null
    overall: OverallScore | null
  }[]
}

export async function listAssessments(getToken: GetToken): Promise<AssessmentSummary[]> {
  const res = await authedFetch(getToken, '/admin/assessments')
  return res.json() as Promise<AssessmentSummary[]>
}

export async function getAssessment(getToken: GetToken, id: string): Promise<AssessmentDetail> {
  const res = await authedFetch(getToken, `/admin/assessments/${id}`)
  return res.json() as Promise<AssessmentDetail>
}

export async function previewAssessment(getToken: GetToken, markdown: string): Promise<PreviewResult> {
  const res = await authedFetch(getToken, '/admin/assessments/preview', { method: 'POST', body: JSON.stringify({ markdown }) })
  return res.json() as Promise<PreviewResult>
}

export async function importAssessment(
  getToken: GetToken,
  markdown: string,
  institutionId: string | null,
): Promise<{ id: string; slug: string; warnings: string[] }> {
  const res = await authedFetch(getToken, '/admin/assessments/import', { method: 'POST', body: JSON.stringify({ markdown, institutionId }) })
  return res.json() as Promise<{ id: string; slug: string; warnings: string[] }>
}

export async function deleteAssessment(getToken: GetToken, id: string): Promise<void> {
  await authedFetch(getToken, `/admin/assessments/${id}`, { method: 'DELETE' })
}

export async function createDelivery(getToken: GetToken, assessmentId: string, input: DeliveryInput): Promise<{ id: string }> {
  const res = await authedFetch(getToken, `/admin/assessments/${assessmentId}/deliveries`, { method: 'POST', body: JSON.stringify(input) })
  return res.json() as Promise<{ id: string }>
}

export async function deleteDelivery(getToken: GetToken, id: string): Promise<void> {
  await authedFetch(getToken, `/admin/deliveries/${id}`, { method: 'DELETE' })
}

export async function createInvite(getToken: GetToken, deliveryId: string): Promise<{ inviteCode: string }> {
  const res = await authedFetch(getToken, `/admin/deliveries/${deliveryId}/invite`, { method: 'POST' })
  return res.json() as Promise<{ inviteCode: string }>
}

export async function revokeInvite(getToken: GetToken, deliveryId: string): Promise<void> {
  await authedFetch(getToken, `/admin/deliveries/${deliveryId}/invite`, { method: 'DELETE' })
}

export async function getDeliveryResults(getToken: GetToken, id: string): Promise<DeliveryResults> {
  const res = await authedFetch(getToken, `/admin/deliveries/${id}/results`)
  return res.json() as Promise<DeliveryResults>
}

// ── Student ────────────────────────────────────────────────────────────────

export interface MyDelivery {
  id: string
  title: string
  label: string
  cohortName: string | null
  opensAt: string | null
  closesAt: string | null
  timeLimitMinutes: number | null
  questionCount: number
  isOpen: boolean
  attempt: { id: string; startedAt: string; submittedAt: string | null; deadlineAt: string | null } | null
}

export interface AttemptPaper {
  id: string
  title: string
  label: string
  startedAt: string
  submittedAt: string | null
  deadlineAt: string | null
  dataset: { slug: string; name: string; setupSql: string; schemaSummary: SchemaTable[] }
  sections: { id: string; title: string; questions: StudentQuestion[] }[]
  answers: Record<string, string>
}

export interface StudentResult {
  title?: string
  label?: string
  submittedAt?: string
  overall: OverallScore
  sections: SectionScoreSummary[]
}

export async function fetchMyAssessments(getToken: GetToken): Promise<MyDelivery[]> {
  const res = await authedFetch(getToken, '/me/assessments')
  return res.json() as Promise<MyDelivery[]>
}

export async function startAttempt(getToken: GetToken, deliveryId: string): Promise<{ id: string }> {
  const res = await authedFetch(getToken, `/me/deliveries/${deliveryId}/attempts`, { method: 'POST' })
  return res.json() as Promise<{ id: string }>
}

export async function fetchAttempt(getToken: GetToken, attemptId: string): Promise<AttemptPaper> {
  const res = await authedFetch(getToken, `/me/attempts/${attemptId}`)
  return res.json() as Promise<AttemptPaper>
}

export async function saveAnswers(getToken: GetToken, attemptId: string, answers: Record<string, string>): Promise<void> {
  await authedFetch(getToken, `/me/attempts/${attemptId}/answers`, { method: 'PUT', body: JSON.stringify({ answers }) })
}

export async function submitAttempt(getToken: GetToken, attemptId: string, answers: Record<string, string>): Promise<StudentResult> {
  const res = await authedFetch(getToken, `/me/attempts/${attemptId}/submit`, { method: 'POST', body: JSON.stringify({ answers }) })
  return res.json() as Promise<StudentResult>
}

export async function fetchAttemptResult(getToken: GetToken, attemptId: string): Promise<StudentResult> {
  const res = await authedFetch(getToken, `/me/attempts/${attemptId}/result`)
  return res.json() as Promise<StudentResult>
}

// ── Invite links (/a/<code>) ───────────────────────────────────────────────

export interface InviteInfo {
  title: string
  label: string
  cohortName: string
  institutionName: string
  opensAt: string | null
  closesAt: string | null
  timeLimitMinutes: number | null
  questionCount: number
  isOpen: boolean
}

/** Public — no token. */
export async function fetchInviteInfo(code: string): Promise<InviteInfo> {
  const res = await fetch(`${API_URL}/api/invites/${encodeURIComponent(code)}`)
  if (!res.ok) throw new Error(res.status === 404 ? 'This invite link is no longer valid.' : `${res.status} ${res.statusText}`)
  return res.json() as Promise<InviteInfo>
}

export async function acceptInvite(getToken: GetToken, code: string): Promise<{ attemptId: string; submitted: boolean }> {
  const res = await authedFetch(getToken, `/invites/${encodeURIComponent(code)}/accept`, { method: 'POST' })
  return res.json() as Promise<{ attemptId: string; submitted: boolean }>
}

// ── Institution analytics: pre ↔ post ──────────────────────────────────────

export interface PrePostStudent {
  userId: string
  anonymousLabel: string
  displayName: string | null
  email: string | null
  pre: Record<string, number> | null // 'overall' + sectionId → percent
  post: Record<string, number> | null
  delta: number | null // post.overall − pre.overall, students with both only
}

export interface PrePostPair {
  assessmentId: string
  assessmentTitle: string
  cohort: { id: string; name: string }
  sections: { id: string; title: string }[]
  pre: { deliveryId: string; label: string; submittedCount: number } | null
  post: { deliveryId: string; label: string; submittedCount: number } | null
  averages: {
    pre: Record<string, number | null>
    post: Record<string, number | null>
    delta: Record<string, number | null>
    pairedCount: number
  }
  students: PrePostStudent[]
}

export interface PrePostResponse {
  institution: { id: string; name: string }
  cohort: { id: string; name: string } | null
  pairs: PrePostPair[]
}

export async function fetchPrePost(getToken: GetToken, institutionId: string, cohortId?: string): Promise<PrePostResponse> {
  const qs = cohortId ? `?cohortId=${encodeURIComponent(cohortId)}` : ''
  const res = await authedFetch(getToken, `/admin/institutions/${institutionId}/assessments${qs}`)
  return res.json() as Promise<PrePostResponse>
}
