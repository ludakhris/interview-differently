/** Frontend client for /api/me/consents — legal acceptance records. */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export type ConsentKind = 'terms' | 'privacy' | 'recording'

export interface ConsentStatus {
  /** Current version of each document. */
  required: Record<ConsentKind, string>
  /** Accepted current version, or null if the user still needs to accept. */
  accepted: Record<ConsentKind, string | null>
}

type GetToken = () => Promise<string | null>

async function call(getToken: GetToken, init?: RequestInit): Promise<ConsentStatus> {
  const token = await getToken()
  if (!token) throw new Error('Not signed in')
  const res = await fetch(`${API_URL}/api/me/consents`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (!res.ok) throw new Error(`Consent request failed (${res.status})`)
  return res.json() as Promise<ConsentStatus>
}

export const fetchConsents = (getToken: GetToken) => call(getToken)

export const acceptConsent = (getToken: GetToken, kind: ConsentKind, version: string) =>
  call(getToken, { method: 'POST', body: JSON.stringify({ kind, version }) })
