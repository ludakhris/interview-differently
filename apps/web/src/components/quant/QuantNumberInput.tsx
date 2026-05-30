// Shared numeric input used by every quant variant. Renders a labelled
// field with optional unit suffix and format-specific prefix ($).
// Intentionally minimal — no inline validation, no error pulses; the band
// check happens on submit so the candidate gets one decisive evaluation
// rather than reactive nags while typing.

import type { QuantNumberFormat } from '@id/types'

interface Props {
  id: string
  label?: string
  prompt?: string
  unit?: string
  format?: QuantNumberFormat
  value: number | ''
  onChange: (next: number | '') => void
  placeholder?: string
  disabled?: boolean
  size?: 'md' | 'lg'
  hint?: string                        // small line below input, e.g. "Carried from Sizing step"
}

export function QuantNumberInput({
  id,
  label,
  prompt,
  unit,
  format,
  value,
  onChange,
  placeholder,
  disabled,
  size = 'md',
  hint,
}: Props) {
  const isCurrency = format === 'currency'
  const inputSize = size === 'lg' ? 'text-[22px] py-2.5' : 'text-[15px] py-2'

  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-[11px] font-semibold uppercase tracking-widest text-white/55 mb-1">
          {label}
        </label>
      )}
      {prompt && <p className="text-[12px] text-white/55 mb-2 leading-snug">{prompt}</p>}
      <div className="relative flex items-baseline">
        {isCurrency && (
          <span className={`absolute left-3 text-white/55 ${size === 'lg' ? 'text-[20px]' : 'text-[14px]'}`}>$</span>
        )}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={value === '' ? '' : value}
          onChange={(e) => {
            const raw = e.target.value.replace(/,/g, '')
            if (raw === '') {
              onChange('')
              return
            }
            const n = Number(raw)
            if (!Number.isFinite(n)) return
            onChange(n)
          }}
          placeholder={placeholder}
          className={`
            w-full bg-[#0a0a0a] border border-white/15 rounded-lg
            ${isCurrency ? 'pl-7' : 'pl-3'}
            ${unit ? 'pr-14' : 'pr-3'}
            ${inputSize}
            font-display font-semibold text-[#f5f3ee]
            placeholder:text-white/25 placeholder:font-normal
            focus:outline-none focus:border-[#4ea58a] focus:ring-1 focus:ring-[#4ea58a]/40
            disabled:opacity-60 disabled:cursor-not-allowed
            tabular-nums
          `}
        />
        {unit && (
          <span className={`absolute right-3 text-white/50 ${size === 'lg' ? 'text-[14px]' : 'text-[12px]'} pointer-events-none`}>
            {unit}
          </span>
        )}
      </div>
      {hint && <p className="mt-1.5 text-[11px] text-white/40">{hint}</p>}
    </div>
  )
}
