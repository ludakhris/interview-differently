import type {
  ImmersiveSession,
  ImmersiveResponse,
  ImmersiveSummary,
} from '@id/types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export async function createImmersiveSession(
  scenarioId: string,
  userId: string,
): Promise<ImmersiveSession> {
  const res = await fetch(`${API_URL}/api/immersive-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenarioId, userId }),
  })
  if (!res.ok) throw new Error(`Failed to create immersive session: ${res.status}`)
  return res.json() as Promise<ImmersiveSession>
}

export interface SubmitResponsePayload {
  nodeId: string
  questionText: string
  transcript?: string
  durationSeconds?: number
  audioBlob?: Blob
}

export async function submitImmersiveResponse(
  sessionId: string,
  payload: SubmitResponsePayload,
): Promise<ImmersiveResponse> {
  const form = new FormData()
  form.append('nodeId', payload.nodeId)
  form.append('questionText', payload.questionText)
  if (payload.transcript) form.append('transcript', payload.transcript)
  if (payload.durationSeconds != null) form.append('durationSeconds', String(payload.durationSeconds))
  if (payload.audioBlob) form.append('file', payload.audioBlob, 'response.webm')

  const res = await fetch(`${API_URL}/api/immersive-sessions/${sessionId}/responses`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(`Failed to submit response: ${res.status}`)
  return res.json() as Promise<ImmersiveResponse>
}

export async function fetchImmersiveResponse(
  sessionId: string,
  responseId: string,
): Promise<ImmersiveResponse> {
  const res = await fetch(
    `${API_URL}/api/immersive-sessions/${sessionId}/responses/${responseId}`,
  )
  if (!res.ok) throw new Error(`Failed to fetch response: ${res.status}`)
  return res.json() as Promise<ImmersiveResponse>
}

export async function fetchImmersiveSession(sessionId: string): Promise<ImmersiveSession> {
  const res = await fetch(`${API_URL}/api/immersive-sessions/${sessionId}`)
  if (!res.ok) throw new Error(`Failed to fetch session: ${res.status}`)
  return res.json() as Promise<ImmersiveSession>
}

export async function fetchImmersiveSummary(sessionId: string): Promise<ImmersiveSummary> {
  const res = await fetch(`${API_URL}/api/immersive-sessions/${sessionId}/summary`)
  if (!res.ok) throw new Error(`Failed to fetch session summary: ${res.status}`)
  return res.json() as Promise<ImmersiveSummary>
}

export interface ImmersiveSessionSummary {
  id: string
  scenarioId: string
  status: string
  createdAt: string
  _count: { responses: number }
}

export async function fetchImmersiveSessionsForUser(
  userId: string,
): Promise<ImmersiveSessionSummary[]> {
  const res = await fetch(`${API_URL}/api/immersive-sessions/user/${userId}`)
  if (!res.ok) throw new Error(`Failed to fetch immersive sessions: ${res.status}`)
  return res.json() as Promise<ImmersiveSessionSummary[]>
}

export interface SignedMediaUrl {
  url: string
  expiresAt: string
}

/**
 * Fetch a time-limited signed URL for a candidate's recorded response.
 * Requires a Clerk session token (see useAuth().getToken()) — the backend
 * verifies it and only returns a URL if the requester owns the session
 * or is an admin.
 */
export async function fetchResponseMediaUrl(
  sessionId: string,
  responseId: string,
  token: string,
): Promise<SignedMediaUrl> {
  const res = await fetch(
    `${API_URL}/api/immersive-sessions/${sessionId}/responses/${responseId}/media-url`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    if (res.status === 404) throw new Error('Recording not yet uploaded')
    if (res.status === 401 || res.status === 403) throw new Error('Not authorised to play this recording')
    throw new Error(`Failed to load recording: ${res.status}`)
  }
  return res.json() as Promise<SignedMediaUrl>
}
