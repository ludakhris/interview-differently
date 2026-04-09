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
