import type { CohortJoinRequestRow, LearnerJoinPending, LearnerJoinRequest } from '@id/types'

// Join-approval wording. The shapes are shared with the API (@id/types).

export type { LearnerJoinRequest }
export type PendingJoinRequest = CohortJoinRequestRow

/** The reply to joining: the learner's card, or a request waiting for an admin. */
export const isPendingJoin = (r: unknown): r is LearnerJoinPending =>
  typeof r === 'object' && r !== null && (r as { pending?: unknown }).pending === true

const clean = (contact: string | null | undefined) => contact?.trim() || null

export function requestSentLine(contact: string | null | undefined): string {
  const c = clean(contact)
  return `Request sent. An admin has to approve it before you can start.${c ? ` Questions? ${c}.` : ''}`
}

/** "Course · Institution" then the state and contact, for one compact line. */
export function requestTitle(r: LearnerJoinRequest): string {
  return `${r.courseTitle} · ${r.institutionName}`
}

export function requestState(r: LearnerJoinRequest): string {
  return r.status === 'declined' ? 'Not approved' : 'Waiting for approval'
}

export function requestContact(r: LearnerJoinRequest): string | null {
  const c = clean(r.contact)
  return c ? `Contact: ${c}` : null
}
