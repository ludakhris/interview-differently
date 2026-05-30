// Visual reference for quant node variants. Mirrors /dev/exhibits — one
// example per variant, source of screenshots for the future author
// userguide + builder picker (Phase 7).
//
// Live components, not screenshots — so any regression in the renderers
// surfaces here on first load.

import { useState } from 'react'
import type { ScenarioNode, QualitySignal, QuantAnswer, QuantFieldResult } from '@id/types'
import { QuantNode } from '@/components/quant/QuantNode'

// Example 1 — numeric-range, no formula. Candidate types one number.
const SIMPLE_NUMERIC: ScenarioNode = {
  nodeId: 'demo-simple',
  type: 'quant',
  narrative: '',
  quantSignalDimensions: ['Quantitative Accuracy'],
  quant: {
    variant: 'numeric-range',
    prompt: 'How many rural families receive state benefits today?',
    context:
      '14M rural people are on state benefits. Average rural household = 4.0 people. Estimate families.',
    field: {
      id: 'families',
      label: 'Rural families on benefits',
      unit: 'families',
      format: 'integer',
      acceptedRange: { min: 3000000, max: 4000000, idealMin: 3400000, idealMax: 3600000 },
      modelAnswer: 3500000,
      derivation:
        '14M ÷ 4 ≈ 3.5M families. Accepted band ±15% on household size assumptions.',
    },
  },
}

// Example 2 — numeric-range with a formula and carry-forward variables.
// Carry-forward is simulated here via the carryForward prop; in a real
// scenario the source nodeId would resolve via useSimulation.
const FORMULA_NUMERIC: ScenarioNode = {
  nodeId: 'demo-formula',
  type: 'quant',
  narrative: '',
  quantSignalDimensions: ['Quantitative Accuracy'],
  quant: {
    variant: 'numeric-range',
    prompt: 'What is the annual savings opportunity?',
    context: 'Each collection trip costs ~50 AUR per family. Benefits disburse monthly.',
    formula: {
      display: 'families × monthly cost × 12 months',
      expression: '{families} * {cost} * 12',
      variables: [
        {
          name: 'families',
          label: 'Families on benefits',
          unit: 'families',
          format: 'integer',
          source: { nodeId: 'demo-simple' },
        },
        {
          name: 'cost',
          label: 'Cost per trip',
          unit: 'AUR',
          format: 'integer',
          defaultValue: 50,
        },
      ],
    },
    field: {
      id: 'savings',
      label: 'Annual savings',
      unit: 'AUR',
      format: 'currency',
      acceptedRange: {
        min: 1800000000,
        max: 2400000000,
        idealMin: 2050000000,
        idealMax: 2150000000,
      },
      modelAnswer: 2100000000,
      derivation: '3.5M × 50 × 12 ≈ 2.1B AUR.',
    },
  },
}

// Example 3 — structured-quant. Three independent fields each band-checked.
const STRUCTURED: ScenarioNode = {
  nodeId: 'demo-structured',
  type: 'quant',
  narrative: '',
  quantSignalDimensions: ['Quantitative Accuracy'],
  quant: {
    variant: 'structured-quant',
    prompt: 'Size the Western Delta pilot funnel.',
    context:
      'Use the pilot uptake exhibit and your structure to break the funnel into eligible households, accounts opened, and active users.',
    fields: [
      {
        id: 'eligible',
        label: 'Eligible households in pilot',
        unit: 'households',
        format: 'integer',
        acceptedRange: { min: 80000, max: 110000, idealMin: 95000, idealMax: 105000 },
        modelAnswer: 100000,
        derivation: 'Western Delta rural pop ÷ 4 per household, scoped to pilot area.',
      },
      {
        id: 'opened',
        label: 'Accounts opened',
        unit: 'accounts',
        format: 'integer',
        acceptedRange: { min: 40000, max: 60000, idealMin: 47000, idealMax: 55000 },
        modelAnswer: 50000,
        derivation: '50% uptake at month 6 per pilot survey.',
      },
      {
        id: 'active',
        label: 'Active monthly users',
        unit: 'users',
        format: 'integer',
        acceptedRange: { min: 25000, max: 40000, idealMin: 30000, idealMax: 36000 },
        modelAnswer: 33000,
        derivation: 'Roughly 2/3 of opened accounts are monthly-active by month 6.',
      },
    ],
  },
}

// ── Demo wrapper ────────────────────────────────────────────────────────────
// Each demo manages its own throwaway submit state — the gallery never
// advances anywhere, it just shows the band feedback inline.

function Demo({ node, carryForward }: { node: ScenarioNode; carryForward?: Record<string, { value: number; from: string }> }) {
  // Track last submission for the gallery; not displayed, just held so QuantNode
  // can render its inline band feedback without us throwing the payload away.
  const [, setLast] = useState<{
    answer: QuantAnswer
    results: QuantFieldResult[]
    signals: QualitySignal[]
  } | null>(null)
  return (
    <QuantNode
      node={node}
      carryForward={carryForward ?? {}}
      onSubmit={(payload) => setLast(payload)}
    />
  )
}

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
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{kind}</p>
        <p className="mt-1 text-[13px] text-white/70 leading-relaxed max-w-2xl">{blurb}</p>
      </header>
      <div data-screenshot-target={id}>{children}</div>
    </section>
  )
}

export function QuantGalleryPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f3ee]">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-12">
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
            Quant library
          </p>
          <h1 className="mt-1 text-[28px] font-display font-extrabold leading-tight">
            Visual reference — quantitative question variants
          </h1>
          <p className="mt-3 text-[14px] text-white/65 leading-relaxed max-w-2xl">
            Quant nodes ask the candidate to compute a specific number with an
            accepted band. Two variants below, plus a formula form with
            carry-forward variables. Submit any of them to see the inline band
            feedback (in-band / accepted / off).
          </p>
        </header>

        <Section
          id="numeric-range"
          kind="variant: numeric-range"
          blurb="Single numeric field with an accepted band and optional ideal sub-band. Best for one-number sizings."
        >
          <Demo node={SIMPLE_NUMERIC} />
        </Section>

        <Section
          id="numeric-range-formula"
          kind="variant: numeric-range  +  formula"
          blurb="Same shape, but the candidate builds the answer from named variables. Variables can carry forward from prior quant answers — pre-filled, but editable."
        >
          <Demo
            node={FORMULA_NUMERIC}
            carryForward={{
              families: { value: 3500000, from: 'How many rural families receive state benefits today?' },
            }}
          />
        </Section>

        <Section
          id="structured-quant"
          kind="variant: structured-quant"
          blurb="Multiple labelled fields each with their own band. Best for funnel breakdowns and multi-step derivations."
        >
          <Demo node={STRUCTURED} />
        </Section>

        <footer className="pt-6 border-t border-white/10 text-[11px] text-white/35 leading-relaxed">
          Reference page for the scenario-author userguide. Renders the live
          components from <code className="font-mono">apps/web/src/components/quant/</code> —
          any regression in a variant or in the formula evaluator surfaces
          here immediately.
        </footer>
      </div>
    </div>
  )
}
