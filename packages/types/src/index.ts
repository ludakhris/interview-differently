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

export interface ChartDataPoint {
  t: string   // x-axis label, e.g. '14:39'
  v: number   // y value
}

export interface ChartConfig {
  title: string
  unit: string                         // e.g. '%', 'ms'
  color: 'red' | 'amber' | 'green'
  baseline?: number                    // normal operating level — renders as dashed reference line
  annotation?: {
    tIndex: number                     // index into series array
    label: string                      // e.g. '↑ Incident start'
  }
  series: ChartDataPoint[]
}

export interface ScenarioNode {
  nodeId: string
  type: NodeType
  narrative: string
  contextPanels?: ContextPanel[]
  chart?: ChartConfig                  // optional time-series chart for monitor-style nodes
  choices?: Choice[]
  // transition nodes
  transitionText?: string
  nextNodeId?: string
  // immersive mode fields
  audioScript?: string                 // exact words for AI narrator; falls back to narrative if absent
  responsePrompt?: string              // open-ended question the candidate answers verbally
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

export interface BuilderNodePosition {
  x: number
  y: number
}

export interface BuilderMeta {
  status: 'draft' | 'published'
  lastEditedAt: string
  positions: Record<string, BuilderNodePosition> // nodeId → canvas position
}

export interface Scenario {
  scenarioId: string
  title: string
  track: TrackType
  estimatedMinutes: number
  mode?: 'text' | 'immersive'          // defaults to 'text' when absent
  briefing: ScenarioBriefing
  display?: ScenarioDisplay
  createdBy?: string // institution id for custom scenarios
  publishedTo?: string[] // cohort ids
  nodes: ScenarioNode[]
  rubric: {
    dimensions: RubricDimension[]
  }
  builderMeta?: BuilderMeta
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

// ── Immersive interview ───────────────────────────────────────────────────────

export type ImmersiveSessionStatus = 'active' | 'completed' | 'abandoned'

export interface ImmersiveResponse {
  id: string
  sessionId: string
  nodeId: string
  questionText: string
  mediaUrl: string | null
  transcript: string | null
  durationSeconds: number | null
  aiFeedback: ImmersiveResponseFeedback | null
  createdAt: string
}

export interface ImmersiveResponseFeedback {
  feedback: string
  strengths: string
  development: string
  generatedAt: string
}

export interface ImmersiveSession {
  id: string
  scenarioId: string
  userId: string
  status: ImmersiveSessionStatus
  createdAt: string
  responses: ImmersiveResponse[]
}

export interface ImmersiveSummary {
  sessionId: string
  overallAssessment: string
  strengths: string[]
  developmentAreas: string[]
  hiringRecommendation: 'strong yes' | 'yes' | 'maybe' | 'no'
  generatedAt: string
}

// ── API responses ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  error?: string
}
