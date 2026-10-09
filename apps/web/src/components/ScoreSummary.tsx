import { ScoreRing } from '@/components/ScoreRing'
import type { OverallScore, SectionScoreSummary } from '@id/types'

/** The overall score ring and the by-section bars. Shared by the learner's result, the LTI review and the admin popup. */
export function ScoreSummary({
  overall,
  sections,
}: {
  overall: OverallScore
  sections: SectionScoreSummary[]
}) {
  return (
    <>
      <div className="bg-surface-deep rounded-2xl border border-edge/10 p-6 flex items-center gap-6 mb-6">
        <ScoreRing score={overall.percent} size={96} label="%" />
        <div>
          <p className="font-display font-extrabold text-[28px] text-fg leading-none">
            {overall.correct}
            <span className="text-ink/30 text-[18px]"> / {overall.total}</span>
          </p>
          <p className="text-[13px] text-slate-mid mt-1">questions correct overall</p>
        </div>
      </div>

      <div className="bg-surface-deep rounded-2xl border border-edge/10 p-6 mb-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-4">
          By section
        </p>
        <ul className="space-y-4">
          {sections.map((s) => {
            const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0
            return (
              <li key={s.sectionId}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <p className="text-[13px] font-semibold text-fg">{s.title}</p>
                  <p className="font-mono text-[12px] text-slate-light">
                    {s.correct}/{s.total} · {pct}%
                  </p>
                </div>
                <div className="h-2 rounded-full bg-ink/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: pct >= 70 ? '#2d9e5f' : pct >= 40 ? '#d4830a' : '#ef4444',
                    }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}
