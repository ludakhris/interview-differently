// Renders model-vs-user side-by-side for a single quant submission. Used
// inside per-phase scorecards on the results page so the candidate sees
// exactly how their answer compared to the model band, per field.

import type { QuantNodeResultSummary, QuantFieldResultRef } from '@id/types'

interface Props {
  result: QuantNodeResultSummary
}

const bandTone: Record<QuantFieldResultRef['band'], { label: string; className: string }> = {
  ideal: { label: 'Strong', className: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' },
  accepted: { label: 'Accepted', className: 'bg-amber-500/10 border-amber-500/30 text-amber-300' },
  low: { label: 'Below band', className: 'bg-red-500/10 border-red-500/30 text-red-300' },
  high: { label: 'Above band', className: 'bg-red-500/10 border-red-500/30 text-red-300' },
}

export function QuantComparePanel({ result }: Props) {
  return (
    <div className="bg-[#0d0d0d] border border-white/10 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/8 bg-white/3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Quant submission</p>
          {result.hintUsed && (
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest border border-amber-500/35 bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-full"
              title="Candidate revealed the hint; signal capped at Proficient."
            >
              💡 Hint used
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[13px] font-medium text-[#f5f3ee] leading-snug">{result.prompt}</p>
      </div>
      <div className="divide-y divide-white/8">
        {result.results.map((field) => {
          const tone = bandTone[field.band]
          return (
            <div key={field.fieldId} className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
                  {field.fieldId}
                </p>
                <div className="mt-1 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/35">Your answer</p>
                    <p className="text-[14px] font-display font-bold text-[#f5f3ee]">
                      {format(field.userAnswer)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/35">Model</p>
                    <p className="text-[14px] font-display font-bold text-[#f5f3ee]">
                      {format(field.modelAnswer)}
                    </p>
                  </div>
                </div>
              </div>
              <span
                className={`inline-flex items-center text-[10px] font-bold uppercase tracking-widest border rounded-full px-2.5 py-1 ${tone.className}`}
              >
                {tone.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function format(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return n.toLocaleString()
  if (!Number.isInteger(n)) return n.toFixed(2)
  return String(n)
}
