import { authHeader } from './authToken'
import { getLtiReturnUrl } from './ltiSession'
import type { Brand } from '@/lib/brand'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/**
 * Outcome of a score hand-back. `navigateTo` is the validated http(s) link the API returned: go
 * there. When it is null the score was still sent (409, already delivered) and `courseUrl` is the
 * best known link back to the course (from the API, else the LTI session), or null.
 */
export type HandBack =
  | { ok: true; navigateTo: string | null; courseUrl: string | null }
  | {
      ok: false
      /** The session was replaced by a newer launch; retrying cannot help. */ replaced?: true
    }

/** The value when it is a parseable http(s) URL, else null. */
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' || u.protocol === 'http:' ? raw : null
  } catch {
    return null
  }
}

/**
 * Reads the answer to a hand-back (`POST /api/lti/tool/complete`), the same for every path.
 * 200/201 need a usable return link. 409 means the score was already sent (single-use claim):
 * success, navigating only if the body carries a link, else falling back to `sessionReturnUrl`
 * for display. Any other status, or a 200 without a link, is a failure (Retry stays available).
 */
export function interpretHandBack(
  status: number,
  body: unknown,
  sessionReturnUrl: string | null = null
): HandBack {
  if (status === 410) return { ok: false, replaced: true }
  if (status !== 200 && status !== 201 && status !== 409) return { ok: false }
  const fromBody = safeHttpUrl((body as { returnUrl?: unknown } | null)?.returnUrl)
  if (status !== 409 && !fromBody) return { ok: false }
  return { ok: true, navigateTo: fromBody, courseUrl: fromBody ?? safeHttpUrl(sessionReturnUrl) }
}

/** Posts the hand-back for one finished play, interview or assessment attempt. Safe to repeat. */
async function postComplete(payload: Record<string, string>): Promise<HandBack> {
  const res = await fetch(`${API_URL}/api/lti/tool/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(payload),
  })
  const body: unknown = await res.json().catch(() => null)
  return interpretHandBack(res.status, body, getLtiReturnUrl())
}

/** Tells the API the learner finished a text simulation; it scores the play it recorded and posts it. */
export const completeLtiPlay = (): Promise<HandBack> => postComplete({ play: 'text' })

/** Scores a finished immersive interview (from its stored transcripts, on the server) and posts it. */
export const completeLtiInterview = (sessionId: string): Promise<HandBack> =>
  postComplete({ sessionId })

/** Sends a graded assessment attempt's score to LearnDifferently. */
export const completeLtiAssessment = (attemptId: string): Promise<HandBack> =>
  postComplete({ attemptId })

/** What the API knows about this launch: the tenant's brand tokens (unvalidated) and a reference. */
export interface LtiToolSession {
  brand: Brand | null
  ref: string
  /** An assessment session opened to look at answers, not to take the assessment. */
  review?: boolean
}

/** Fetches the launch session. Callers treat any failure as "no brand". */
export async function fetchLtiToolSession(): Promise<LtiToolSession> {
  const res = await fetch(`${API_URL}/api/lti/tool/session`, {
    headers: { ...(await authHeader()) },
  })
  if (!res.ok) throw new Error(`Session lookup failed: ${res.status}`)
  const data = (await res.json()) as Partial<LtiToolSession>
  return {
    brand: data.brand ?? null,
    ref: typeof data.ref === 'string' ? data.ref : '',
    ...(data.review === true ? { review: true } : {}),
  }
}
