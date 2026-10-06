import { authHeader } from './authToken'
import type { Brand } from '@/lib/brand'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/** Tells the API the learner finished; it returns the score and where to send the browser back. */
export async function completeLtiAttempt(
  resultId: string
): Promise<{ score: number; returnUrl: string }> {
  const res = await fetch(`${API_URL}/api/lti/tool/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ resultId }),
  })
  if (!res.ok) throw new Error(`Score hand-back failed: ${res.status}`)
  const data = (await res.json()) as { score: number; returnUrl: string }
  if (typeof data.returnUrl !== 'string' || !data.returnUrl) {
    throw new Error('Score hand-back returned no return link')
  }
  return data
}

/** Scores a finished immersive interview (from its stored transcripts, on the server) and posts it. */
export async function completeLtiInterview(
  sessionId: string
): Promise<{ score: number; returnUrl: string }> {
  const res = await fetch(`${API_URL}/api/lti/tool/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ sessionId }),
  })
  if (!res.ok) throw new Error(`Score hand-back failed: ${res.status}`)
  const data = (await res.json()) as { score: number; returnUrl: string }
  if (typeof data.returnUrl !== 'string' || !data.returnUrl) {
    throw new Error('Score hand-back returned no return link')
  }
  return data
}

export type AssessmentHandoff = { ok: true; returnUrl: string | null } | { ok: false }

/**
 * Reads the answer to an assessment hand-back. 409 means the score was already sent: success, with
 * a return link only if the body has one. A return link must be http(s); anything else is dropped.
 */
export function interpretAssessmentComplete(status: number, body: unknown): AssessmentHandoff {
  if (status !== 200 && status !== 201 && status !== 409) return { ok: false }
  const raw = (body as { returnUrl?: unknown } | null)?.returnUrl
  let returnUrl: string | null = null
  if (typeof raw === 'string') {
    try {
      const u = new URL(raw)
      if (u.protocol === 'https:' || u.protocol === 'http:') returnUrl = raw
    } catch {
      // not a URL — treated as absent
    }
  }
  if (status !== 409 && !returnUrl) return { ok: false }
  return { ok: true, returnUrl }
}

/** Sends a graded assessment attempt's score to LearnDifferently. Safe to repeat (409 = already sent). */
export async function completeLtiAssessment(attemptId: string): Promise<AssessmentHandoff> {
  const res = await fetch(`${API_URL}/api/lti/tool/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ attemptId }),
  })
  const body: unknown = await res.json().catch(() => null)
  return interpretAssessmentComplete(res.status, body)
}

/** What the API knows about this launch: the tenant's brand tokens (unvalidated) and a reference. */
export interface LtiToolSession {
  brand: Brand | null
  ref: string
}

/** Fetches the launch session. Callers treat any failure as "no brand". */
export async function fetchLtiToolSession(): Promise<LtiToolSession> {
  const res = await fetch(`${API_URL}/api/lti/tool/session`, {
    headers: { ...(await authHeader()) },
  })
  if (!res.ok) throw new Error(`Session lookup failed: ${res.status}`)
  const data = (await res.json()) as Partial<LtiToolSession>
  return { brand: data.brand ?? null, ref: typeof data.ref === 'string' ? data.ref : '' }
}
