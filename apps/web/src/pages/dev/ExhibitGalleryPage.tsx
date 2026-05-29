// Internal showcase of every exhibit subtype with rich sample data.
//
// Doubles as:
//   1. Visual reference for the future scenario-author userguide / editor
//      help panel (one screenshot per subtype).
//   2. Smoke test — any regression in a renderer surfaces here without
//      having to advance through a live simulation.
//
// Public route (no auth) so screenshots can be captured headless. Lives at
// /dev/exhibits.

import type {
  DataTableExhibit,
  ProfitTreeExhibit,
  SegmentationMatrixExhibit,
  ChartExhibit as ChartExhibitType,
  TextExhibit as TextExhibitType,
} from '@id/types'
import { DataTable } from '@/components/exhibits/DataTable'
import { ProfitTree } from '@/components/exhibits/ProfitTree'
import { SegmentationMatrix } from '@/components/exhibits/SegmentationMatrix'
import { ChartExhibit } from '@/components/exhibits/ChartExhibit'
import { TextExhibit } from '@/components/exhibits/TextExhibit'

// ── Sample exhibits — illustrative, not tied to any single scenario ────────

const SAMPLE_TEXT: TextExhibitType = {
  id: 'sample-text',
  kind: 'text-exhibit',
  title: 'Memo from Engagement Manager',
  caption: 'Received 8:47 AM — frame your thinking before the brief',
  footnote: 'Internal, do not forward',
  blocks: [
    {
      kind: 'paragraph',
      text:
        "Northstar wants a clean answer to \"should we use the Aurelia Retail Network to deliver financial services to the rural unbanked?\" — not a survey of options, not a McKinsey 7S. A defensible yes/no with the sizing to back it.",
    },
    {
      kind: 'bullets',
      items: [
        'The Foundation already believes this could help millions; our job is to test that belief, not validate it.',
        'Three weeks of fieldwork get us regional survey data — design your framework so we know what data is decisive.',
        'Watch for the easy trap: assuming uptake. We have signal, not proof.',
      ],
    },
    {
      kind: 'quote',
      text: "If the answer doesn't change the Foundation's capital allocation, it's not the answer they hired us for.",
      attribution: 'Engagement Manager',
    },
  ],
}

const SAMPLE_TABLE: DataTableExhibit = {
  id: 'sample-table',
  kind: 'data-table',
  title: 'Rural population by region',
  caption: 'Source: Aurelia National Statistics Bureau, 2024 release',
  footnote: 'Region totals exclude transient seasonal workers (≈2% national).',
  columns: [
    { key: 'region', label: 'Region', align: 'left', format: 'text', sortable: true },
    { key: 'pop', label: 'Rural pop', format: 'number', sortable: true },
    { key: 'benefits', label: 'On benefits', format: 'number', sortable: true },
    { key: 'share', label: 'Share', format: 'percent', sortable: true },
    { key: 'stores', label: 'Network stores', format: 'number', sortable: true },
  ],
  rows: [
    { region: 'Northern Highlands', pop: 4200000, benefits: { value: 2300000, tone: 'accent' }, share: 55, stores: 3100 },
    { region: 'Central Plains', pop: 8900000, benefits: 4100000, share: 46, stores: 7200 },
    { region: 'Eastern Coast', pop: 5600000, benefits: 2800000, share: 50, stores: 4500 },
    { region: 'Western Delta', pop: 6100000, benefits: { value: 3400000, tone: 'accent', emphasis: true }, share: 56, stores: 4800 },
    { region: 'Southern Range', pop: 3200000, benefits: 1400000, share: 44, stores: 2400 },
  ],
  totalRow: {
    region: { value: 'Total', emphasis: true },
    pop: 28000000,
    benefits: 14000000,
    share: 50,
    stores: 22000,
  },
}

const SAMPLE_TREE: ProfitTreeExhibit = {
  id: 'sample-tree',
  kind: 'profit-tree',
  title: 'Annual savings opportunity — issue tree',
  caption: 'Each branch surfaces an assumption worth testing.',
  root: {
    id: 'root',
    label: 'Annual savings to rural population',
    value: '$2.1B',
    formula: 'families × monthly cost × 12 months',
    tone: 'accent',
    children: [
      {
        id: 'families',
        label: 'Rural families receiving benefits',
        value: '3.5M',
        formula: '14M people ÷ 4 per family',
        children: [
          { id: 'people', label: 'People on benefits', value: '14M' },
          { id: 'avgfam', label: 'Avg household size', value: '4.0' },
        ],
      },
      {
        id: 'cost',
        label: 'Cost per collection trip',
        value: '50 AUR',
        formula: 'travel + lost wages + risk premium',
        tone: 'danger',
        children: [
          { id: 'travel', label: 'Bus / fuel cost', value: '18 AUR' },
          { id: 'wages', label: 'Lost wages (½ day)', value: '25 AUR' },
          { id: 'risk', label: 'Theft / risk reserve', value: '7 AUR' },
        ],
      },
      {
        id: 'freq',
        label: 'Trips per year',
        value: '12',
        formula: 'monthly benefit cycle',
      },
    ],
  },
}

const SAMPLE_CHART: ChartExhibitType = {
  id: 'sample-chart',
  kind: 'chart',
  title: 'Western Delta pilot — service uptake (Months 0–6)',
  caption: 'Households opening at least one financial account, % of eligible.',
  footnote: 'Survey n=4,200 households, Western Delta pilot, 2024.',
  chart: {
    title: 'Cumulative uptake',
    unit: '%',
    color: 'green',
    baseline: 25,
    annotation: { tIndex: 3, label: '↑ SMS reminder rollout' },
    series: [
      { t: 'M0', v: 4 },
      { t: 'M1', v: 9 },
      { t: 'M2', v: 17 },
      { t: 'M3', v: 26 },
      { t: 'M4', v: 38 },
      { t: 'M5', v: 47 },
      { t: 'M6', v: 53 },
    ],
  },
}

const SAMPLE_MATRIX: SegmentationMatrixExhibit = {
  id: 'sample-matrix',
  kind: 'segmentation-matrix',
  title: 'Regional rollout prioritisation',
  caption: 'Plot each region by demand signal × infrastructure readiness.',
  footnote:
    'Demand: % on benefits × uptake trend. Readiness: network density + agent training.',
  xAxis: { label: 'Infrastructure readiness', lowLabel: 'Low', highLabel: 'High' },
  yAxis: { label: 'Demand signal', lowLabel: 'Low', highLabel: 'High' },
  quadrantLabels: {
    topLeft: 'Invest to enable',
    topRight: 'Phase 1 — launch',
    bottomLeft: 'Defer',
    bottomRight: 'Adjacent expansion',
  },
  quadrants: {
    topLeft: [{ label: 'Northern Highlands', caption: 'High need, sparse network' }],
    topRight: [
      { label: 'Western Delta', caption: 'Pilot region — proven uptake' },
      { label: 'Central Plains', caption: 'Largest pop, mature network' },
    ],
    bottomLeft: [{ label: 'Southern Range', caption: 'Lowest benefit share' }],
    bottomRight: [{ label: 'Eastern Coast', caption: 'Urban migration risk' }],
  },
}

// ── Page ───────────────────────────────────────────────────────────────────

interface SectionProps {
  id: string
  kind: string
  blurb: string
  children: React.ReactNode
}

function Section({ id, kind, blurb, children }: SectionProps) {
  return (
    <section id={id} className="space-y-3">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
          {kind}
        </p>
        <p className="mt-1 text-[13px] text-white/70 leading-relaxed max-w-2xl">
          {blurb}
        </p>
      </header>
      <div data-screenshot-target={id}>{children}</div>
    </section>
  )
}

export function ExhibitGalleryPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f3ee]">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-12">
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
            Exhibit library
          </p>
          <h1 className="mt-1 text-[28px] font-display font-extrabold leading-tight">
            Visual reference — every exhibit subtype
          </h1>
          <p className="mt-3 text-[14px] text-white/65 leading-relaxed max-w-2xl">
            Each block below is one of the five exhibit subtypes available to
            case authors. Pick a subtype based on the kind of evidence you want
            the candidate to read — they all share the same chrome (title,
            caption, footnote) so cases feel consistent across authors.
          </p>
        </header>

        <Section
          id="text-exhibit"
          kind="kind: text-exhibit"
          blurb="Rich text built from typed blocks: paragraphs, bullets, attributed quotes. Use for dialogue snippets, market context, study findings."
        >
          <TextExhibit exhibit={SAMPLE_TEXT} />
        </Section>

        <Section
          id="data-table"
          kind="kind: data-table"
          blurb="Sortable rows × columns. Cells can carry tone (accent / danger) and emphasis to highlight what the candidate should notice."
        >
          <DataTable exhibit={SAMPLE_TABLE} />
        </Section>

        <Section
          id="profit-tree"
          kind="kind: profit-tree"
          blurb="Drillable issue tree. Each node carries label, value, and optional formula — collapse / expand levels as the candidate reads."
        >
          <ProfitTree exhibit={SAMPLE_TREE} />
        </Section>

        <Section
          id="chart"
          kind="kind: chart"
          blurb="Reuses the existing time-series chart used by ops monitor nodes. Supports baseline reference lines and annotations."
        >
          <ChartExhibit exhibit={SAMPLE_CHART} />
        </Section>

        <Section
          id="segmentation-matrix"
          kind="kind: segmentation-matrix"
          blurb="2 × 2 with labelled axes and per-quadrant titles. Common for prioritisation, BCG-style growth-share, value-vs-effort."
        >
          <SegmentationMatrix exhibit={SAMPLE_MATRIX} />
        </Section>

        <footer className="pt-6 border-t border-white/10 text-[11px] text-white/35 leading-relaxed">
          Reference page for the scenario-author userguide. Renders the live
          components from <code className="font-mono">apps/web/src/components/exhibits/</code>{' '}
          — any regression in a subtype shows up here immediately.
        </footer>
      </div>
    </div>
  )
}
