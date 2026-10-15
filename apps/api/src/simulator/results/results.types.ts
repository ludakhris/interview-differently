export interface DimensionScoreInput {
  dimension: string
  score: number
  quality: string
  feedback: string
}

export interface CreateResultDto {
  id: string
  userId: string
  scenarioId: string
  scenarioTitle: string
  track: string
  completedAt: string
  overallScore: number
  dimensionScores: DimensionScoreInput[]
  choiceSequence: string[]
}

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
