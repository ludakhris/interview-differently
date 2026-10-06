import { authHeader } from './authToken'

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
