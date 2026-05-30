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
}

export function QuantNode({ node, carryForward, onSubmit }: Props) {
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
    <NumericRangeView node={node} spec={spec} carryForward={carryForward} onSubmit={onSubmit} />
  ) : (
    <StructuredView node={node} spec={spec} carryForward={carryForward} onSubmit={onSubmit} />
  )
}

// ── numeric-range ────────────────────────────────────────────────────────────

function NumericRangeView({
  node,
  spec,
  carryForward,
  onSubmit,
}: {
  node: ScenarioNode
  spec: Extract<QuantSpec, { variant: 'numeric-range' }>
  carryForward: Record<string, { value: number; from: string }>
  onSubmit: Props['onSubmit']
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
      <QuestionHeader prompt={spec.prompt} context={spec.context} field={spec.field} />

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

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!ready || submitted !== null}
          className={`
            font-display font-semibold text-[14px] px-7 py-3 rounded-lg transition-all
            ${ready && !submitted
              ? 'bg-green hover:bg-green-light text-white cursor-pointer'
              : 'bg-white/10 text-slate-light cursor-not-allowed'}
          `}
        >
          {submitted ? 'Submitted' : 'Submit answer'}
        </button>
      </div>
    </div>
  )
}

// ── structured-quant ─────────────────────────────────────────────────────────

function StructuredView({
  node,
  spec,
  carryForward,
  onSubmit,
}: {
  node: ScenarioNode
  spec: Extract<QuantSpec, { variant: 'structured-quant' }>
  carryForward: Record<string, { value: number; from: string }>
  onSubmit: Props['onSubmit']
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
      <QuestionHeader prompt={spec.prompt} context={spec.context} />

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

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!ready || submitted !== null}
          className={`
            font-display font-semibold text-[14px] px-7 py-3 rounded-lg transition-all
            ${ready && !submitted
              ? 'bg-green hover:bg-green-light text-white cursor-pointer'
              : 'bg-white/10 text-slate-light cursor-not-allowed'}
          `}
        >
          {submitted ? 'Submitted' : 'Submit answers'}
        </button>
      </div>
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function QuestionHeader({
  prompt,
  context,
  field,
}: {
  prompt: string
  context?: string
  field?: QuantFieldSpec
}) {
  return (
    <div className="bg-[#111111] border border-white/10 rounded-2xl p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
        Quant
      </p>
      <p className="mt-1 text-[16px] font-display font-semibold text-[#f5f3ee] leading-snug">
        {prompt}
      </p>
      {context && (
        <p className="mt-2 text-[13px] text-white/65 leading-relaxed">{context}</p>
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
