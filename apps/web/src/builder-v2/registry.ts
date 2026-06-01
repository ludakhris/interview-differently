// Entity Registry — the single descriptor table that drives:
//   - gallery picker cards (label, blurb, screenshot, helpHtml)
//   - blank seeds (non-empty starting points)
//   - Phase A: kind tag rendered in the document
//
// Phase B wires in the Picker. Phase C wires in the inline Editors.
// Phase F wires in the Preview column.
//
// "Add a kind once → it shows in the picker, seeds non-empty, gets an
//  editor, and renders a preview."

import type { Exhibit, ScenarioNode, QuantSpec } from '@id/types'

export type EntityGroup = 'exhibit' | 'quant' | 'node'

export type EntityKind =
  // exhibits
  | 'text-exhibit'
  | 'data-table'
  | 'profit-tree'
  | 'segmentation-matrix'
  | 'chart'
  // quant
  | 'numeric-range'
  | 'structured-quant'
  // nodes
  | 'decision'
  | 'transition'
  | 'feedback'

export interface EntityDescriptor {
  kind: EntityKind
  group: EntityGroup
  label: string      // "Data Table"
  emoji: string      // used as icon placeholder until we have SVGs
  blurb: string      // one-line gallery caption
  example: string    // italic example use case shown below blurb
  // Path relative to /docs/screenshots — used by Picker to show a real preview.
  screenshot?: string
}

export const REGISTRY: EntityDescriptor[] = [
  // ── Exhibits ────────────────────────────────────────────────────────────────
  {
    kind: 'text-exhibit',
    group: 'exhibit',
    label: 'Text / Memo',
    emoji: '📝',
    blurb: 'Rich text passage — paragraphs, bullets, quotes with attribution.',
    example: 'e.g. Engagement manager briefing memo',
    screenshot: 'exhibits/01-text-exhibit.png',
  },
  {
    kind: 'data-table',
    group: 'exhibit',
    label: 'Data Table',
    emoji: '📊',
    blurb: 'Rows × columns with highlightable cells and an optional total row.',
    example: 'e.g. Revenue by segment, BEV adoption curve',
    screenshot: 'exhibits/02-data-table.png',
  },
  {
    kind: 'profit-tree',
    group: 'exhibit',
    label: 'Profit Tree',
    emoji: '🌳',
    blurb: 'Drillable issue tree — revenue / cost breakdowns.',
    example: 'e.g. Why are margins down?',
    screenshot: 'exhibits/03-profit-tree.png',
  },
  {
    kind: 'segmentation-matrix',
    group: 'exhibit',
    label: 'Segmentation Matrix',
    emoji: '▦',
    blurb: '2×2 grid; items per quadrant, highlight the star quadrant.',
    example: 'e.g. Market attractiveness × competitive position',
    screenshot: 'exhibits/04-segmentation-matrix.png',
  },
  {
    kind: 'chart',
    group: 'exhibit',
    label: 'Chart',
    emoji: '📈',
    blurb: 'Trend line with a baseline value and an optional annotation.',
    example: 'e.g. BEV adoption curve, revenue growth',
    screenshot: 'exhibits/05-chart.png',
  },
  // ── Quant ───────────────────────────────────────────────────────────────────
  {
    kind: 'numeric-range',
    group: 'quant',
    label: 'Numeric Range',
    emoji: '🔢',
    blurb: 'One number, one accepted band. Add an optional formula + hint.',
    example: 'e.g. "How many rural families receive benefits?"',
    screenshot: 'quant/01-numeric-range.png',
  },
  {
    kind: 'structured-quant',
    group: 'quant',
    label: 'Structured Quant',
    emoji: '🔢',
    blurb: 'Several linked numbers, each with its own band. Carry one answer into the next.',
    example: 'e.g. TAM → SAM → SOM',
    screenshot: 'quant/02-structured-quant.png',
  },
  // ── Nodes ───────────────────────────────────────────────────────────────────
  {
    kind: 'decision',
    group: 'node',
    label: 'Decision',
    emoji: '🔀',
    blurb: 'Candidate picks one option; each option carries a quality signal.',
    example: 'e.g. "How do you structure the TAM/SAM/SOM model?"',
  },
  {
    kind: 'transition',
    group: 'node',
    label: 'Redirect / Transition',
    emoji: '↩',
    blurb: 'Narrative bridge or redirect — no candidate choice, just continues.',
    example: 'e.g. Wrong-path redirect back to the main flow',
  },
  {
    kind: 'feedback',
    group: 'node',
    label: 'Ending',
    emoji: '🏁',
    blurb: 'Case conclusion reached by one or more decision paths.',
    example: 'e.g. Strong recommendation, too conservative',
  },
]

export function descriptorFor(kind: EntityKind): EntityDescriptor {
  const d = REGISTRY.find(r => r.kind === kind)
  if (!d) throw new Error(`No descriptor for entity kind: ${kind}`)
  return d
}

// ── Seeds — non-empty blanks so authors always start with a working example ──

export function seedExhibit(kind: EntityKind, id: string): Exhibit {
  switch (kind) {
    case 'text-exhibit':
      return {
        id,
        kind: 'text-exhibit',
        title: 'Memo from Engagement Manager',
        caption: 'Read before you begin.',
        blocks: [
          { kind: 'paragraph', text: 'Add the key framing for this phase here.' },
          { kind: 'bullets', items: ['Key fact one', 'Key fact two', 'Key fact three'] },
        ],
      }
    case 'data-table':
      return {
        id,
        kind: 'data-table',
        title: 'Data table',
        caption: 'Source: provided by client.',
        columns: [
          { key: 'label', label: 'Category', align: 'left', format: 'text' },
          { key: 'value', label: 'Value', align: 'right', format: 'number' },
        ],
        rows: [
          { label: 'Row A', value: 100 },
          { label: 'Row B', value: 200 },
          { label: 'Row C', value: 150 },
        ],
      }
    case 'profit-tree':
      return {
        id,
        kind: 'profit-tree',
        title: 'Profit breakdown',
        caption: 'Trace the driver of underperformance.',
        root: {
          id: 'root',
          label: 'Profit',
          value: '$22M',
          children: [
            { id: 'rev', label: 'Revenue', value: '$180M', children: [] },
            { id: 'cost', label: 'Cost', value: '$158M', children: [] },
          ],
        },
      }
    case 'segmentation-matrix':
      return {
        id,
        kind: 'segmentation-matrix',
        title: 'Segmentation matrix',
        xAxis: { label: 'Market attractiveness', lowLabel: 'Low', highLabel: 'High' },
        yAxis: { label: 'Competitive position', lowLabel: 'Weak', highLabel: 'Strong' },
        quadrants: {
          topLeft: [{ label: 'Invest selectively' }],
          topRight: [{ label: 'Grow aggressively' }],
          bottomLeft: [{ label: 'Exit or harvest' }],
          bottomRight: [{ label: 'Defend position' }],
        },
        quadrantLabels: { topRight: 'Stars' },
      }
    case 'chart':
      return {
        id,
        kind: 'chart',
        title: 'Trend',
        caption: 'Year-on-year.',
        chart: {
          title: 'Growth',
          unit: '%',
          color: 'green',
          baseline: 0,
          series: [
            { t: 'Y1', v: 10 },
            { t: 'Y2', v: 18 },
            { t: 'Y3', v: 28 },
            { t: 'Y4', v: 35 },
          ],
        },
      }
    default:
      throw new Error(`seedExhibit: unsupported kind "${kind}"`)
  }
}

export function seedNode(kind: EntityKind, id: string): ScenarioNode {
  switch (kind) {
    case 'decision':
      return {
        nodeId: id,
        type: 'decision',
        narrative: 'How would you approach this problem?',
        choices: [
          { id: 'A', text: 'Option A — describe your approach here.', nextNodeId: '', qualitySignals: [{ dimension: 'Rubric dimension', quality: 'strong' }] },
          { id: 'B', text: 'Option B — alternative approach.', nextNodeId: '', qualitySignals: [{ dimension: 'Rubric dimension', quality: 'proficient' }] },
          { id: 'C', text: 'Option C — weaker approach.', nextNodeId: '', qualitySignals: [{ dimension: 'Rubric dimension', quality: 'developing' }] },
        ],
      }
    case 'transition':
      return {
        nodeId: id,
        type: 'transition',
        narrative: 'The engagement manager redirects you. Add the bridge narrative here.',
        nextNodeId: '',
      }
    case 'feedback':
      return {
        nodeId: id,
        type: 'feedback',
        narrative: 'Case complete. Add the closing feedback narrative here.',
      }
    case 'numeric-range':
      return {
        nodeId: id,
        type: 'quant',
        narrative: 'Compute the answer using the data provided.',
        quant: {
          variant: 'numeric-range',
          prompt: 'What is your estimate?',
          field: {
            id: 'answer',
            label: 'Your answer',
            unit: 'M',
            format: 'decimal',
            acceptedRange: { min: 0, max: 100, idealMin: 40, idealMax: 60 },
            modelAnswer: 50,
            derivation: 'Explain the derivation here.',
          },
        } satisfies QuantSpec,
      }
    case 'structured-quant':
      return {
        nodeId: id,
        type: 'quant',
        narrative: 'Compute each component in sequence.',
        quant: {
          variant: 'structured-quant',
          prompt: 'Work through each step.',
          fields: [
            {
              id: 'step1',
              label: 'Step 1',
              unit: 'M',
              format: 'decimal',
              acceptedRange: { min: 0, max: 100, idealMin: 40, idealMax: 60 },
              modelAnswer: 50,
              derivation: 'Explain step 1 derivation.',
            },
            {
              id: 'step2',
              label: 'Step 2',
              unit: 'M',
              format: 'decimal',
              acceptedRange: { min: 0, max: 50, idealMin: 20, idealMax: 30 },
              modelAnswer: 25,
              derivation: 'Explain step 2 derivation.',
            },
          ],
        } satisfies QuantSpec,
      }
    default:
      throw new Error(`seedNode: unsupported kind "${kind}"`)
  }
}
