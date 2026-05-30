// Renders a quant-type ScenarioNode. Handles both variants
// (numeric-range and structured-quant), the optional formula panel + carry
// forward, submit-to-evaluate flow, and inline band feedback.
//
// State lives locally until submit; on submit we hand the answer + per-
// dimension quality signals back to the simulation hook.

import { useState } from 'react'
import type {
  ScenarioNode,
  QuantSpec,
  QuantAnswer,
  QuantFieldResult,
  QuantFieldSpec,
  QuantBandHit,
  QualitySignal,
  ScoreQuality,
} from '@id/types'
import { QuantNumberInput } from './QuantNumberInput'
import { FormulaPanel } from './FormulaPanel'
import { classifyAnswer, evaluateFormula, formatQuantValue } from '@/lib/quant/formula'

interface Props {
  node: ScenarioNode
  carryForward: Record<string, { value: number; from: string }>
  onSubmit: (payload: {
    answer: QuantAnswer
    results: QuantFieldResult[]
    signals: QualitySignal[]
  }) => void
  // Called the first time the candidate reveals the hint for this node.
  // SimulationPage wires this to useSimulation.markHintUsed so the
  // submission is flagged + signal capped at proficient.
  onHintUsed?: (nodeId: string) => void
}

export function QuantNode({ node, carryForward, onSubmit, onHintUsed }: Props) {
  const spec = node.quant
  if (!spec) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-[12px] text-amber-300">
        Quant node <code className="font-mono">{node.nodeId}</code> is missing its
        <code className="font-mono"> quant</code> spec.
      </div>
    )
  }

  return spec.variant === 'numeric-range' ? (
    <NumericRangeView node={node} spec={spec} carryForward={carryForward} onSubmit={onSubmit} onHintUsed={onHintUsed} />
  ) : (
    <StructuredView node={node} spec={spec} carryForward={carryForward} onSubmit={onSubmit} onHintUsed={onHintUsed} />
  )
}

// ── Hint UI ──────────────────────────────────────────────────────────────────

function HintControls({
  hint,
  footnote,
  nodeId,
  onHintUsed,
}: {
  hint: string
  footnote?: string
  nodeId: string
  onHintUsed?: (nodeId: string) => void
}) {
  // 'idle' = nothing showing. 'confirming' = impact dialog before reveal so
  // the candidate sees the score cap before committing. 'shown' = formula
  // revealed (and `onHintUsed` was called).
  const [stage, setStage] = useState<'idle' | 'confirming' | 'shown'>('idle')

  function confirmReveal() {
    setStage('shown')
    onHintUsed?.(nodeId)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setStage(stage === 'shown' ? 'shown' : 'confirming')}
        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
          stage === 'shown'
            ? 'border-amber-500/35 bg-amber-500/10 text-amber-300'
            : 'border-white/15 bg-white/5 text-white/65 hover:border-white/25 hover:text-[#f5f3ee]'
        }`}
        aria-haspopup="dialog"
      >
        <span aria-hidden>💡</span>
        {stage === 'shown' ? 'Hint shown' : 'Need a hint?'}
      </button>

      {stage === 'confirming' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Confirm hint">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Cancel"
            onClick={() => setStage('idle')}
          />
          <div className="relative bg-[#111111] border border-white/15 rounded-2xl p-6 max-w-md w-[88%] mx-4 shadow-2xl animate-fade-in">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Confirm</p>
            <h3 className="mt-1 text-[16px] font-display font-bold text-[#f5f3ee]">
              Show the formula for this question?
            </h3>
            <p className="mt-3 text-[14px] text-white/80 leading-relaxed">
              If you use the hint, your highest possible score on this question
              drops from <span className="text-emerald-300 font-semibold">Strong</span> to{' '}
              <span className="text-amber-300 font-semibold">Proficient</span>. It will also
              show on your results page.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStage('idle')}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white/70 hover:text-[#f5f3ee] border border-white/15 hover:border-white/30 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReveal}
                className="px-4 py-2 rounded-lg text-[13px] font-display font-semibold bg-amber-500/20 border border-amber-500/40 text-amber-200 hover:bg-amber-500/30 transition-colors"
              >
                Show hint
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'shown' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Formula hint">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close"
            onClick={() => { /* dismiss only — already marked used */ }}
          />
          <div className="relative bg-[#111111] border border-white/15 rounded-2xl p-6 max-w-md w-[88%] mx-4 shadow-2xl animate-fade-in">
            <div className="flex items-start justify-between gap-3 mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Formula</p>
              <button
                type="button"
                onClick={() => setStage('idle')}
                className="text-white/50 hover:text-white text-[18px] leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="text-[15px] font-mono text-[#f5f3ee] leading-relaxed whitespace-pre-wrap">{hint}</p>
            {footnote && (
              <div className="mt-4 pt-3 border-t border-white/10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Glossary</p>
                <p className="text-[12px] text-white/65 leading-relaxed whitespace-pre-wrap">{footnote}</p>
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setStage('idle')}
                className="bg-green hover:bg-green-light text-white font-display font-semibold text-[13px] px-5 py-2 rounded-lg transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── numeric-range ────────────────────────────────────────────────────────────

function NumericRangeView({
  node,
  spec,
  carryForward,
  onSubmit,
  onHintUsed,
}: {
  node: ScenarioNode
  spec: Extract<QuantSpec, { variant: 'numeric-range' }>
  carryForward: Record<string, { value: number; from: string }>
  onSubmit: Props['onSubmit']
  onHintUsed?: (nodeId: string) => void
}) {
  // formula variable state (when present)
  const [vars, setVars] = useState<Record<string, number | ''>>(() =>
    seedVariables(spec.formula?.variables ?? [], carryForward),
  )

  // direct numeric field state (when no formula, the candidate types the
  // answer; when there is a formula, the answer is computed from vars)
  const [direct, setDirect] = useState<number | ''>('')
  const [submitted, setSubmitted] = useState<{
    band: QuantBandHit
    value: number
  } | null>(null)

  function handleSubmit() {
    let userValue: number | null = null
    if (spec.formula) {
      // recompute
      const nums: Record<string, number> = {}
      for (const v of spec.formula.variables) {
        const x = vars[v.name]
        if (typeof x !== 'number' || !Number.isFinite(x)) return
        nums[v.name] = x
      }
      const result = evaluateFormula(spec.formula.expression, { variables: nums })
      if (result === null) return
      userValue = result
    } else {
      if (typeof direct !== 'number') return
      userValue = direct
    }
    const band = classifyAnswer(userValue, spec.field.acceptedRange)
    const result: QuantFieldResult = {
      fieldId: spec.field.id,
      modelAnswer: spec.field.modelAnswer,
      userAnswer: userValue,
      band,
    }
    const signals = signalsFromBand(band, node.quantSignalDimensions ?? ['Quantitative Accuracy'])
    setSubmitted({ band, value: userValue })
    onSubmit({
      answer: spec.formula
        ? {
            value: userValue,
            variables: numericVars(vars),
          }
        : { value: userValue },
      results: [result],
      signals,
    })
  }

  const ready = spec.formula
    ? spec.formula.variables.every(v => typeof vars[v.name] === 'number')
    : typeof direct === 'number'

  return (
    <div className="space-y-5">
      <QuestionHeader
        prompt={spec.prompt}
        context={spec.context}
        field={spec.field}
        hint={spec.hint ? <HintControls hint={spec.hint} footnote={spec.hintFootnote} nodeId={node.nodeId} onHintUsed={onHintUsed} /> : null}
      />

      {spec.formula ? (
        <FormulaPanel
          nodeId={node.nodeId}
          formula={spec.formula}
          values={vars}
          onChange={setVars}
          carryForward={carryForward}
          resultUnit={spec.field.unit}
          resultFormat={spec.field.format}
          resultLabel={spec.field.label ?? 'Computed result'}
        />
      ) : (
        <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl p-5">
          <QuantNumberInput
            id={`${node.nodeId}-direct`}
            label={spec.field.label}
            prompt={spec.field.prompt}
            unit={spec.field.unit}
            format={spec.field.format}
            value={direct}
            onChange={setDirect}
            size="lg"
          />
        </div>
      )}

      {submitted && (
        <BandFeedback
          band={submitted.band}
          userValue={submitted.value}
          field={spec.field}
        />
      )}

      {/* Hide the Submit button entirely after submission — SimulationPage
          renders a Continue button below the band feedback, and showing a
          disabled "Submitted" alongside it reads as two competing CTAs. */}
      {!submitted && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!ready}
            className={`
              font-display font-semibold text-[14px] px-7 py-3 rounded-lg transition-all
              ${ready
                ? 'bg-green hover:bg-green-light text-white cursor-pointer'
                : 'bg-white/10 text-slate-light cursor-not-allowed'}
            `}
          >
            Submit answer
          </button>
        </div>
      )}
    </div>
  )
}

// ── structured-quant ─────────────────────────────────────────────────────────

function StructuredView({
  node,
  spec,
  carryForward,
  onSubmit,
  onHintUsed,
}: {
  node: ScenarioNode
  spec: Extract<QuantSpec, { variant: 'structured-quant' }>
  carryForward: Record<string, { value: number; from: string }>
  onSubmit: Props['onSubmit']
  onHintUsed?: (nodeId: string) => void
}) {
  const [vars, setVars] = useState<Record<string, number | ''>>(() =>
    seedVariables(spec.formula?.variables ?? [], carryForward),
  )
  const [fieldValues, setFieldValues] = useState<Record<string, number | ''>>(
    () => Object.fromEntries(spec.fields.map(f => [f.id, ''])),
  )
  const [submitted, setSubmitted] = useState<QuantFieldResult[] | null>(null)

  function handleSubmit() {
    const results: QuantFieldResult[] = []
    for (const f of spec.fields) {
      const v = fieldValues[f.id]
      if (typeof v !== 'number' || !Number.isFinite(v)) return
      const band = classifyAnswer(v, f.acceptedRange)
      results.push({ fieldId: f.id, modelAnswer: f.modelAnswer, userAnswer: v, band })
    }
    const worst = worstBand(results.map(r => r.band))
    const signals = signalsFromBand(worst, node.quantSignalDimensions ?? ['Quantitative Accuracy'])
    setSubmitted(results)
    onSubmit({
      answer: {
        fields: Object.fromEntries(results.map(r => [r.fieldId, r.userAnswer])),
        ...(spec.formula ? { variables: numericVars(vars) } : {}),
      },
      results,
      signals,
    })
  }

  const ready = spec.fields.every(f => typeof fieldValues[f.id] === 'number')

  return (
    <div className="space-y-5">
      <QuestionHeader
        prompt={spec.prompt}
        context={spec.context}
        hint={spec.hint ? <HintControls hint={spec.hint} footnote={spec.hintFootnote} nodeId={node.nodeId} onHintUsed={onHintUsed} /> : null}
      />

      {spec.formula && (
        <FormulaPanel
          nodeId={node.nodeId}
          formula={spec.formula}
          values={vars}
          onChange={setVars}
          carryForward={carryForward}
          resultLabel="Working result"
        />
      )}

      <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl p-5 space-y-4">
        {spec.fields.map(f => (
          <QuantNumberInput
            key={f.id}
            id={`${node.nodeId}-${f.id}`}
            label={f.label}
            prompt={f.prompt}
            unit={f.unit}
            format={f.format}
            value={fieldValues[f.id] ?? ''}
            onChange={(next) =>
              setFieldValues((prev) => ({ ...prev, [f.id]: next }))
            }
          />
        ))}
      </div>

      {submitted && (
        <div className="space-y-2">
          {submitted.map(r => {
            const f = spec.fields.find(x => x.id === r.fieldId)!
            return <BandFeedback key={r.fieldId} band={r.band} userValue={r.userAnswer} field={f} />
          })}
        </div>
      )}

      {!submitted && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!ready}
            className={`
              font-display font-semibold text-[14px] px-7 py-3 rounded-lg transition-all
              ${ready
                ? 'bg-green hover:bg-green-light text-white cursor-pointer'
                : 'bg-white/10 text-slate-light cursor-not-allowed'}
            `}
          >
            Submit answers
          </button>
        </div>
      )}
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function QuestionHeader({
  prompt,
  context,
  field,
  hint,
}: {
  prompt: string
  context?: string
  field?: QuantFieldSpec
  hint?: React.ReactNode
}) {
  return (
    <div className="bg-[#111111] border border-white/10 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
          Quant
        </p>
        {hint}
      </div>
      <p className="mt-1 text-[16px] font-display font-semibold text-[#f5f3ee] leading-snug">
        {prompt}
      </p>
      {context && (
        <p className="mt-2 text-[14px] text-white/70 leading-relaxed">{context}</p>
      )}
      {field?.unit && (
        <p className="mt-3 text-[11px] text-white/40">
          Answer in <span className="text-white/70">{field.unit}</span>
          {field.format ? ` (${field.format})` : ''}.
        </p>
      )}
    </div>
  )
}

function BandFeedback({
  band,
  userValue,
  field,
}: {
  band: QuantBandHit
  userValue: number
  field: QuantFieldSpec
}) {
  const { tone, headline } = bandPresentation(band)
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest">{headline}</p>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40">Your answer</p>
          <p className="mt-0.5 text-[16px] font-display font-bold text-[#f5f3ee]">
            {formatQuantValue(userValue, field.format, field.unit)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40">Model answer</p>
          <p className="mt-0.5 text-[16px] font-display font-bold text-[#f5f3ee]">
            {formatQuantValue(field.modelAnswer, field.format, field.unit)}
          </p>
          <p className="text-[10px] text-white/40 mt-0.5">
            Accepted band: {formatQuantValue(field.acceptedRange.min, field.format, field.unit)} – {formatQuantValue(field.acceptedRange.max, field.format, field.unit)}
          </p>
        </div>
      </div>
      {field.derivation && (
        <p className="mt-3 text-[12px] text-white/65 leading-relaxed border-t border-white/10 pt-3">
          {field.derivation}
        </p>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function seedVariables(
  variables: { name: string; defaultValue?: number; source?: { nodeId: string } }[],
  carryForward: Record<string, { value: number; from: string }>,
): Record<string, number | ''> {
  const out: Record<string, number | ''> = {}
  for (const v of variables) {
    if (carryForward[v.name]) {
      out[v.name] = carryForward[v.name].value
    } else if (typeof v.defaultValue === 'number') {
      out[v.name] = v.defaultValue
    } else {
      out[v.name] = ''
    }
  }
  return out
}

function numericVars(vars: Record<string, number | ''>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v === 'number') out[k] = v
  }
  return out
}

function worstBand(bands: QuantBandHit[]): QuantBandHit {
  if (bands.some(b => b === 'low' || b === 'high')) return bands.find(b => b !== 'ideal' && b !== 'accepted')!
  if (bands.some(b => b === 'accepted')) return 'accepted'
  return 'ideal'
}

function signalsFromBand(band: QuantBandHit, dimensions: string[]): QualitySignal[] {
  const quality: ScoreQuality =
    band === 'ideal' ? 'strong' : band === 'accepted' ? 'proficient' : 'developing'
  return dimensions.map((d) => ({ dimension: d, quality }))
}

function bandPresentation(band: QuantBandHit) {
  if (band === 'ideal') {
    return {
      tone: 'bg-emerald-500/8 border-emerald-500/30 text-emerald-300',
      headline: 'Strong — inside the model band',
    }
  }
  if (band === 'accepted') {
    return {
      tone: 'bg-amber-500/8 border-amber-500/30 text-amber-300',
      headline: 'Accepted — close to model',
    }
  }
  return {
    tone: 'bg-red-500/8 border-red-500/30 text-red-300',
    headline:
      band === 'low'
        ? 'Below the accepted band — review your assumptions'
        : 'Above the accepted band — review your assumptions',
  }
}
