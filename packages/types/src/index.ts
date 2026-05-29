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
  | 'business case'
  | 'risk'
  | 'customer-success'
  | 'general'
  | 'custom'

// Subcategories applicable when track === 'business case'.
// Derived from real-world case-interview taxonomy (see docs/business-cases-research.md).
export const BUSINESS_CASE_SUBCATEGORIES = [
  'market-sizing',
  'profitability',
  'm-and-a',
  'market-entry',
  'pricing',
  'operations-improvement',
  'growth-strategy',
  'competitive-response',
  'diagnostics',
  'valuation',
  'product-launch',
  'customer-segmentation',
] as const

export type BusinessCaseSubcategory = (typeof BUSINESS_CASE_SUBCATEGORIES)[number]

// Human-readable labels for each subcategory — used in UI dropdowns + dashboard headers.
export const BUSINESS_CASE_SUBCATEGORY_LABELS: Record<BusinessCaseSubcategory, string> = {
  'market-sizing': 'Market Sizing',
  profitability: 'Profitability',
  'm-and-a': 'M&A',
  'market-entry': 'Market Entry',
  pricing: 'Pricing',
  'operations-improvement': 'Operations Improvement',
  'growth-strategy': 'Growth Strategy',
  'competitive-response': 'Competitive Response',
  diagnostics: 'Diagnostics',
  valuation: 'Valuation',
  'product-launch': 'Product Launch',
  'customer-segmentation': 'Customer Segmentation',
}

export interface ContextPanel {
  label: string
  value: string
  type: 'metric' | 'alert' | 'info'
  // ── KeyData layout extensions ───────────────────────────────────────────────
  // These fields are consumed by the case-style KeyData layouts (tile-grid,
  // hero-list, context-cards, briefing-sections). They are optional and
  // ignored by the legacy ops/risk styles (monitor / table / finding).
  caption?: string                     // small supporting line beneath the value
  unit?: string                        // suffix shown after the value, e.g. 'stores', 'people'
  share?: number                       // 0-100, drives the mini-bar in context-cards
  tone?: 'accent' | 'danger' | 'neutral' // emphasis colour for the value
  hero?: boolean                       // marks the framing stat for hero-list
  group?: string                       // section name for briefing-sections (e.g. 'Market', 'Customer', 'Constraint')
}

// ── Scenario Display ──────────────────────────────────────────────────────────

// Legacy ops/risk styles + new case-style layouts. Each new layout below is
// implemented as a standalone renderer in apps/web/src/components/keydata and
// can be reused across scenarios by setting `display.contextStyle` to the
// matching key.
export type ContextDisplayStyle =
  | 'monitor'
  | 'table'
  | 'finding'
  | 'tile-grid'
  | 'hero-list'
  | 'context-cards'
  | 'briefing-sections'

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

export interface ScenarioInterviewer {
  presenterId: string                  // D-ID presenter id (e.g. 'amy-Aq6OmGZnMt')
  voiceId: string                      // Microsoft Azure voice id (e.g. 'en-GB-SoniaNeural')
}

// ── Phases ────────────────────────────────────────────────────────────────────
//
// A Scenario can optionally be broken into ordered phases (e.g. for consulting
// case interviews: "Structure → Sizing → Exhibit Read → Recommendation"). Each
// phase pins a set of nodes and exhibits that belong to it; the simulation UI
// renders a phase stepper at the top and keeps phase-pinned exhibits visible
// across every node in that phase.
//
// Scenarios without `phases` render as a single implicit phase (back-compat).

export interface ScenarioPhase {
  id: string                           // stable phase id, e.g. 'structure'
  label: string                        // short display label, e.g. 'Structure'
  description?: string                 // 1-line description shown on hover / mobile drawer
  nodeIds: string[]                    // node ids that belong to this phase, in order
  exhibitIds?: string[]                // exhibit ids pinned to this phase (Phase 3 — exhibits)
  rubricDimensions?: string[]          // dimension names scored within this phase (subset of scenario.rubric.dimensions)
}

export interface Scenario {
  scenarioId: string
  title: string
  track: TrackType
  // Optional sub-grouping within a track. Currently only used when track === 'business case',
  // where it must be one of BUSINESS_CASE_SUBCATEGORIES. Reserved for other tracks to use later.
  subcategory?: BusinessCaseSubcategory | string
  estimatedMinutes: number
  mode?: 'text' | 'immersive'          // defaults to 'text' when absent
  interviewer?: ScenarioInterviewer    // required when mode === 'immersive' (locks persona for pre-rendering)
  briefing: ScenarioBriefing
  display?: ScenarioDisplay
  createdBy?: string // institution id for custom scenarios
  publishedTo?: string[] // cohort ids
  nodes: ScenarioNode[]
  // Optional ordered phases — used by case-style scenarios where the candidate
  // moves through distinct stages (Structure → Sizing → Read Exhibit → Recommend).
  // When absent, the simulation renders as a single implicit phase containing
  // all decision nodes.
  phases?: ScenarioPhase[]
  rubric: {
    dimensions: RubricDimension[]
  }
  builderMeta?: BuilderMeta
}

// ── Pre-rendered avatar media ─────────────────────────────────────────────────

export type ScenarioMediaAssetStatus = 'queued' | 'rendering' | 'ready' | 'failed'

export interface ScenarioMediaAsset {
  id: string
  scenarioId: string
  nodeId: string
  scriptHash: string                   // sha256 of the audioScript that produced this clip
  presenterId: string
  voiceId: string
  status: ScenarioMediaAssetStatus
  mediaUrl: string | null              // public URL (R2) once status === 'ready'
  durationMs: number | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
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
