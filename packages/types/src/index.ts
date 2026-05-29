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
  exhibitIds?: string[]                // ids of exhibits pinned to this phase (looked up in scenario.exhibits)
  rubricDimensions?: string[]          // dimension names scored within this phase (subset of scenario.rubric.dimensions)
}

// ── Exhibits ──────────────────────────────────────────────────────────────────
//
// An exhibit is a structured piece of supporting evidence shown alongside the
// case question — data tables, profit trees, segmentation matrices, charts,
// text passages. Exhibits live in a top-level `scenario.exhibits` catalog and
// are referenced from phases via `exhibitIds`, so the same exhibit can be
// reused across phases without duplication.

export type ExhibitKind =
  | 'data-table'
  | 'profit-tree'
  | 'segmentation-matrix'
  | 'chart'
  | 'text-exhibit'

interface ExhibitBase {
  id: string                           // stable exhibit id, e.g. 'rural-population-table'
  kind: ExhibitKind
  title: string                        // visible header, e.g. 'Rural population by region'
  caption?: string                     // 1-2 line context shown below the title
  footnote?: string                    // source / method note shown beneath the body
}

// data-table — rows × columns. Optional per-cell tone for highlighting.
export interface DataTableColumn {
  key: string                          // column id, matches keys in row data
  label: string
  align?: 'left' | 'right' | 'center'  // default right for numeric
  format?: 'number' | 'currency' | 'percent' | 'text'  // hint for renderer
  sortable?: boolean
}

export interface DataTableCell {
  value: string | number
  tone?: 'accent' | 'danger' | 'neutral'
  emphasis?: boolean                   // bold-weight cell
}

export interface DataTableRow {
  // keyed by column.key. Cells may be raw values (string|number) or rich {value, tone, emphasis}.
  [columnKey: string]: string | number | DataTableCell
}

export interface DataTableExhibit extends ExhibitBase {
  kind: 'data-table'
  columns: DataTableColumn[]
  rows: DataTableRow[]
  totalRow?: DataTableRow              // optional sticky bottom row
}

// profit-tree — hierarchical issue tree, e.g. Profit → Revenue/Cost → ...
// Each node carries a label + optional value/formula. Children make the tree
// drillable: collapse/expand levels.
export interface ProfitTreeNode {
  id: string
  label: string
  value?: string                       // displayed value, e.g. '$22M' or '50%'
  formula?: string                     // optional formula explanation
  tone?: 'accent' | 'danger' | 'neutral'
  children?: ProfitTreeNode[]
}

export interface ProfitTreeExhibit extends ExhibitBase {
  kind: 'profit-tree'
  root: ProfitTreeNode
}

// segmentation-matrix — 2×2 grid. Each quadrant has a label + list of items.
export interface SegmentationMatrixItem {
  label: string
  caption?: string
}

export interface SegmentationMatrixExhibit extends ExhibitBase {
  kind: 'segmentation-matrix'
  xAxis: { label: string; lowLabel: string; highLabel: string }
  yAxis: { label: string; lowLabel: string; highLabel: string }
  quadrants: {
    topLeft: SegmentationMatrixItem[]
    topRight: SegmentationMatrixItem[]
    bottomLeft: SegmentationMatrixItem[]
    bottomRight: SegmentationMatrixItem[]
  }
  // optional per-quadrant header tone (e.g. highlight the 'star' quadrant)
  quadrantLabels?: {
    topLeft?: string
    topRight?: string
    bottomLeft?: string
    bottomRight?: string
  }
}

// chart — reuses the existing ChartConfig used by ops monitor nodes.
export interface ChartExhibit extends ExhibitBase {
  kind: 'chart'
  chart: ChartConfig
}

// text-exhibit — rich text passage (paragraphs + bullet lists).
export interface TextExhibitBlock {
  kind: 'paragraph' | 'bullets' | 'quote'
  text?: string                        // for paragraph / quote
  items?: string[]                     // for bullets
  attribution?: string                 // for quote
}

export interface TextExhibit extends ExhibitBase {
  kind: 'text-exhibit'
  blocks: TextExhibitBlock[]
}

export type Exhibit =
  | DataTableExhibit
  | ProfitTreeExhibit
  | SegmentationMatrixExhibit
  | ChartExhibit
  | TextExhibit

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
  // Top-level catalog of exhibits. Phases reference these by id via
  // `exhibitIds`. Keeping exhibits at the scenario level (rather than nested
  // under phases) lets one exhibit be shared across phases — e.g. a key data
  // table that's introduced in Sizing and still visible during Recommendation.
  exhibits?: Exhibit[]
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
