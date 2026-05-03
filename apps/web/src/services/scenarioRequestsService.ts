const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export interface ScenarioRequestPayload {
  // Required
  situation: string
  hardestMoment: string
  // Optional
  role?: string
  reportsTo?: string
  timeInRole?: string
  otherPeople?: string
  metricsContext?: string
  timePressure?: string
  temptingWrong?: string
  greatLooksLike?: string
  track?: string
  estimatedMinutes?: number
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  // Hidden anti-bot field — must be empty for the submission to be accepted.
  honeypot?: string
}

export async function submitScenarioRequest(
  payload: ScenarioRequestPayload,
): Promise<{ id: string }> {
  const res = await fetch(`${API_URL}/api/scenario-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    if (res.status === 429) throw new Error('Too many requests — please wait an hour before trying again.')
    const text = await res.text().catch(() => '')
    let message = `Submission failed (${res.status})`
    try {
      const parsed = JSON.parse(text) as { message?: string }
      if (parsed.message) message = parsed.message
    } catch {/* keep default */}
    throw new Error(message)
  }
  return res.json() as Promise<{ id: string }>
}
