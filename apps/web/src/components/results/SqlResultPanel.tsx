// Renders one SQL submission on the results page: the prompt, the query the
// candidate submitted, and whether its result set matched the reference.

import type { SqlNodeResultSummary } from '@id/types'

interface Props {
  result: SqlNodeResultSummary
}

export function SqlResultPanel({ result }: Props) {
  const tone = result.correct
    ? { label: 'Correct', className: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' }
    : { label: 'Incorrect', className: 'bg-red-500/10 border-red-500/30 text-red-300' }
  return (
    <div className="bg-[#0d0d0d] border border-white/10 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/8 bg-white/3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">SQL submission</p>
          <div className="flex items-center gap-2">
            {result.hintUsed && (
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest border border-amber-500/35 bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-full"
                title="Candidate revealed the hint; signal capped at Proficient."
              >
                💡 Hint used
              </span>
            )}
            <span className={`text-[10px] font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full ${tone.className}`}>{tone.label}</span>
          </div>
        </div>
        <p className="mt-0.5 text-[13px] font-medium text-[#f5f3ee] leading-snug">{result.prompt}</p>
      </div>
      <pre className="px-4 py-3 font-mono text-[12px] text-[#f5f3ee]/85 whitespace-pre-wrap">{result.sql}</pre>
      {!result.correct && result.reason && (
        <p className="px-4 pb-3 text-[12px] text-red-300/80">{result.reason}</p>
      )}
    </div>
  )
}
