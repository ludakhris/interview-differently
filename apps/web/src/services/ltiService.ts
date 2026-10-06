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
