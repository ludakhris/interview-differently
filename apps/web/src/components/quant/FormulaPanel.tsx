// Renders a QuantFormula as a row of variable inputs plus a live computed
// result. Variables marked with a `source` are pre-filled from prior quant
// answers (carry-forward) but stay editable so the candidate can override.

import { useMemo } from 'react'
import type { QuantFormula, QuantVariable } from '@id/types'
import { QuantNumberInput } from './QuantNumberInput'
import { evaluateFormula, formatQuantValue } from '@/lib/quant/formula'

interface Props {
  nodeId: string
  formula: QuantFormula
  values: Record<string, number | ''>
  onChange: (next: Record<string, number | ''>) => void
  carryForward: Record<string, { value: number; from: string }>
  // unit + format used when displaying the final computed result
  resultUnit?: string
  resultFormat?: 'currency' | 'percent' | 'integer' | 'decimal'
  resultLabel?: string
}

export function FormulaPanel({
  nodeId,
  formula,
  values,
  onChange,
  carryForward,
  resultUnit,
  resultFormat,
  resultLabel = 'Computed result',
}: Props) {
  const numericValues = useMemo(() => {
    const out: Record<string, number | undefined> = {}
    for (const v of formula.variables) {
      const raw = values[v.name]
      out[v.name] = raw === '' || raw === undefined ? undefined : Number(raw)
    }
    return out
  }, [values, formula.variables])

  const computed = useMemo(
    () => evaluateFormula(formula.expression, { variables: numericValues }),
    [formula.expression, numericValues],
  )

  return (
    <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl p-5">
      <header className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
          Formula
        </p>
        <p className="mt-1 text-[14px] text-[#f5f3ee] font-medium leading-snug">
          {formula.display ?? formula.expression}
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {formula.variables.map(v => (
          <VariableInput
            key={v.name}
            nodeId={nodeId}
            variable={v}
            value={values[v.name] ?? ''}
            onChange={(next) => onChange({ ...values, [v.name]: next })}
            carryForward={carryForward[v.name]}
          />
        ))}
      </div>

      <div className="mt-5 flex items-baseline justify-between border-t border-white/10 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
          {resultLabel}
        </p>
        <p
          className={`text-[24px] font-display font-extrabold ${
            computed === null ? 'text-white/30' : 'text-[#7fc8b2]'
          }`}
        >
          {computed === null
            ? '—'
            : formatQuantValue(
                computed,
                resultFormat ?? 'decimal',
                resultUnit,
              )}
        </p>
      </div>
    </div>
  )
}

function VariableInput({
  nodeId,
  variable,
  value,
  onChange,
  carryForward,
}: {
  nodeId: string
  variable: QuantVariable
  value: number | ''
  onChange: (next: number | '') => void
  carryForward?: { value: number; from: string }
}) {
  const id = `${nodeId}-var-${variable.name}`
  const hint = carryForward
    ? `Carried forward from ${carryForward.from}. Override if you disagree.`
    : undefined

  return (
    <QuantNumberInput
      id={id}
      label={variable.label}
      unit={variable.unit}
      format={variable.format}
      value={value}
      onChange={onChange}
      hint={hint}
      placeholder={
        variable.defaultValue !== undefined
          ? String(variable.defaultValue)
          : undefined
      }
    />
  )
}
