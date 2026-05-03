import type { ScenarioResult } from '@id/types'

export interface DimensionAverage {
  dimension: string
  averageScore: number
}

export interface ResultSummary {
  id: string
  scenarioId: string
  scenarioTitle: string
  track: string
  overallScore: number
  completedAt: string
}

export interface CompetencyProfile {
  dimensionAverages: DimensionAverage[]
  history: ResultSummary[]
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export async function saveResult(result: ScenarioResult & { scenarioTitle: string }): Promise<void> {
  const res = await fetch(`${API_URL}/api/results`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  })
  if (!res.ok) {
    console.warn('Failed to persist simulation result:', res.status)
  }
}

/**
 * Records the start of a traditional simulation. Powers the completion-rate
 * metric on institution analytics — denominator is count(SimulationAttempt),
 * numerator is count(SimulationResult). Failures are non-fatal: the user's
 * play experience must not depend on this recording.
 */
export async function recordSimulationAttempt(payload: {
  userId: string
  scenarioId: string
  track: string
}): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/api/results/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) console.warn('Failed to record simulation attempt:', res.status)
  } catch (err) {
    console.warn('Simulation attempt request failed:', err)
  }
}

export async function fetchResult(resultId: string): Promise<ScenarioResult> {
  const res = await fetch(`${API_URL}/api/results/${resultId}`)
  if (!res.ok) throw new Error(`Result fetch failed: ${res.status}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await res.json() as any
  return {
    id: row.id,
    userId: row.userId,
    scenarioId: row.scenarioId,
    track: row.track,
    overallScore: row.overallScore,
    completedAt: row.completedAt,
    choiceSequence: row.choiceSequence,
    dimensionScores: row.dimensionScores.map((d: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      dimension: d.dimension,
      score: d.score,
      quality: d.quality as 'strong' | 'proficient' | 'developing',
      feedback: d.feedback,
    })),
  }
}

export async function fetchProfile(userId: string): Promise<CompetencyProfile> {
  const res = await fetch(`${API_URL}/api/results/profile/${userId}`)
  if (!res.ok) throw new Error('Failed to fetch competency profile')
  return res.json() as Promise<CompetencyProfile>
}

export interface AiFeedbackDimension {
  dimension: string
  feedback: string
}

export interface AiFeedbackResponse {
  dimensions: AiFeedbackDimension[]
  generatedAt: string
}

export async function fetchAiFeedback(resultId: string): Promise<AiFeedbackResponse> {
  const res = await fetch(`${API_URL}/api/results/${resultId}/ai-feedback`)
  if (!res.ok) throw new Error(`AI feedback fetch failed: ${res.status}`)
  return res.json() as Promise<AiFeedbackResponse>
}
