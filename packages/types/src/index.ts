// ── User ────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  name: string
  institutionId: string
  cohortIds: string[]
  createdAt: string
}

// ── Scoring ─────────────────────────────────────────────────────────────────

export type ScoreQuality = 'strong' | 'proficient' | 'developing'

export interface QualitySignal {
  dimension: string
  quality: ScoreQuality
}

export interface DimensionScore {
  dimension: string
  score: number // 1-100
  quality: ScoreQuality
  feedback: string
}

export interface ScenarioResult {
  id: string
  userId: string
  scenarioId: string
  track: string
  completedAt: string
  overallScore: number
  dimensionScores: DimensionScore[]
  choiceSequence: string[] // e.g. ['A', 'C', 'B']
}

// ── Scenario ─────────────────────────────────────────────────────────────────

export type NodeType = 'decision' | 'transition' | 'feedback'

export type TrackType =
  | 'operations'
  | 'business'
  | 'risk'
  | 'customer-success'
  | 'general'
  | 'custom'

export interface ContextPanel {
  label: string
  value: string
  type: 'metric' | 'alert' | 'info'
}

// ── Scenario Display ──────────────────────────────────────────────────────────

export type ContextDisplayStyle = 'monitor' | 'table' | 'finding'

export interface SidebarItem {
  label: string
  value: string
  emphasis?: 'danger' | 'warning' | 'success'
}

export interface SidebarSection {
  title: string
  style?: 'text' | 'list' | 'highlight'
  items: SidebarItem[]
}

export interface IncidentMeta {
  id: string           // e.g. 'INC-2026-0341'
  discoveredAt: string // display string, e.g. '10:22 AM'
  severity: string     // e.g. 'High', 'P2'
  status: string       // e.g. 'Open — Uncontained'
  assignedTo?: string
  regulatoryFlag?: string  // e.g. 'SOX / GLBA — mandatory review'
}

export interface ScenarioDisplay {
  contextStyle: ContextDisplayStyle
  sidebar: SidebarSection[]
  alertBanner?: {
    icon: string
    title: string
    body: string
  }
  incidentMeta?: IncidentMeta
}

export interface Choice {
  id: 'A' | 'B' | 'C' | 'D'
  text: string
  nextNodeId: string
  qualitySignals: QualitySignal[]
}

export interface ScenarioNode {
  nodeId: string
  type: NodeType
  narrative: string
  contextPanels?: ContextPanel[]
  choices?: Choice[]
  // transition nodes
  transitionText?: string
  nextNodeId?: string
}

export interface RubricDimension {
  name: string
  description: string
}

export interface ScenarioBriefing {
  situation: string
  role: string
  organisation: string
  reportsTo: string
  timeInRole: string
}

export interface Scenario {
  scenarioId: string
  title: string
  track: TrackType
  estimatedMinutes: number
  briefing: ScenarioBriefing
  display?: ScenarioDisplay
  createdBy?: string // institution id for custom scenarios
  publishedTo?: string[] // cohort ids
  nodes: ScenarioNode[]
  rubric: {
    dimensions: RubricDimension[]
  }
}

// ── Session ──────────────────────────────────────────────────────────────────

export interface SimulationSession {
  sessionId: string
  userId: string
  scenarioId: string
  currentNodeId: string
  choicesMade: Record<string, string> // nodeId -> choiceId
  startedAt: string
  completedAt?: string
}

// ── Institution ───────────────────────────────────────────────────────────────

export interface Institution {
  id: string
  name: string
  domain: string
  createdAt: string
}

export interface Cohort {
  id: string
  institutionId: string
  name: string
  createdAt: string
}

// ── API responses ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  error?: string
}
