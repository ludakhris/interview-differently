// One per phase on the results page. Shows the phase label, an aggregate
// score, the dimensions this phase graded, and any quant submissions that
// happened inside the phase (model-vs-user).

import type { PhaseScore } from '@id/types'
import { QuantComparePanel } from './QuantComparePanel'

const qualityLabel = { strong: 'Strong', proficient: 'Proficient', developing: 'Developing' } as const
const qualityColor = { strong: '#2d9e5f', proficient: '#d4830a', developing: '#c0392b' } as const

interface Props {
  phase: PhaseScore
  index: number
}

export function PhaseScoreCard({ phase, index }: Props) {
  const overallTone =
    phase.overallScore >= 80 ? 'strong' : phase.overallScore >= 60 ? 'proficient' : 'developing'
  const showOverall = phase.dimensionScores.length > 0

  return (
    <section className="bg-[#111111] border border-white/10 rounded-2xl overflow-hidden">
      <header className="px-5 py-4 border-b border-white/8 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            Phase {index + 1}
          </p>
          <h3 className="mt-0.5 text-[16px] font-display font-bold text-[#f5f3ee] leading-tight">
            {phase.label}
          </h3>
          {phase.description && (
            <p className="mt-1 text-[12px] text-white/55 leading-snug max-w-md">
              {phase.description}
            </p>
          )}
        </div>
        {showOverall && (
          <div className="flex-shrink-0 text-right">
            <p className="text-[10px] uppercase tracking-widest text-white/40">Phase score</p>
            <p
              className="text-[24px] font-display font-extrabold tabular-nums"
              style={{ color: qualityColor[overallTone] }}
            >
              {phase.overallScore}
            </p>
          </div>
        )}
      </header>

      <div className="px-5 py-4 space-y-4">
        {phase.dimensionScores.length > 0 && (
          <div className="space-y-2">
            {phase.dimensionScores.map((dim) => (
              <div key={dim.dimension} className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-[#f5f3ee] flex-1 truncate">{dim.dimension}</span>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${dim.score}%`, backgroundColor: qualityColor[dim.quality] }}
                    />
                  </div>
                  <span
                    className="text-[11px] font-bold w-20 text-right"
                    style={{ color: qualityColor[dim.quality] }}
                  >
                    {qualityLabel[dim.quality]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {phase.quantResults.length > 0 && (
          <div className="space-y-3 pt-1">
            {phase.quantResults.map((q) => (
              <QuantComparePanel key={q.nodeId} result={q} />
            ))}
          </div>
        )}

        {phase.dimensionScores.length === 0 && phase.quantResults.length === 0 && (
          <p className="text-[12px] text-white/35 italic">
            No scored interaction in this phase.
          </p>
        )}
      </div>
    </section>
  )
}
