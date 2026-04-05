import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Nav } from '@/components/Nav'
import { ScoreRing } from '@/components/ScoreRing'
import { trackMeta } from '@/lib/scenarios'
import type { ScenarioResult } from '@id/types'

const qualityLabel = {
  strong: 'Strong',
  proficient: 'Proficient',
  developing: 'Developing',
}

const qualityColor = {
  strong: '#2d9e5f',
  proficient: '#d4830a',
  developing: '#c0392b',
}

const qualityBg = {
  strong: 'bg-green/10 border-green/30',
  proficient: 'bg-amber/10 border-amber/20',
  developing: 'bg-red-500/10 border-red-500/20',
}

export function FeedbackPage() {
  const { scenarioId } = useParams<{ scenarioId: string }>()
  const navigate = useNavigate()
  const [result, setResult] = useState<ScenarioResult | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem(`result-${scenarioId}`)
    if (stored) {
      setResult(JSON.parse(stored) as ScenarioResult)
    } else {
      navigate('/dashboard')
    }
  }, [scenarioId, navigate])

  if (!result) return null

  const meta = trackMeta[result.track] ?? trackMeta['operations']

  const overallQuality =
    result.overallScore >= 80 ? 'strong' : result.overallScore >= 60 ? 'proficient' : 'developing'

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav trackLabel={meta.label} />

      <div className="max-w-3xl mx-auto px-6 py-12 animate-fade-in">
        <div className="text-center mb-10">
          <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-2">
            Simulation Complete
          </p>
          <h1 className="font-display font-extrabold text-[26px] text-[#f5f3ee] tracking-tight mb-8">
            Your Performance Report
          </h1>

          <div className="flex justify-center mb-6">
            <ScoreRing score={result.overallScore} size={140} strokeWidth={12} />
          </div>

          <div
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[13px] font-semibold ${qualityBg[overallQuality]}`}
            style={{ color: qualityColor[overallQuality] }}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: qualityColor[overallQuality] }} />
            Overall: {qualityLabel[overallQuality]}
          </div>
        </div>

        <div className="mb-8">
          <h2 className="font-display font-bold text-[13px] uppercase tracking-widest text-slate-mid mb-4">
            Competency Breakdown
          </h2>
          <div className="space-y-4">
            {result.dimensionScores.map((dim) => (
              <div
                key={dim.dimension}
                className="bg-[#111111] rounded-xl border border-white/10 p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-display font-bold text-[15px] text-[#f5f3ee]">
                    {dim.dimension}
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${dim.score}%`,
                          backgroundColor: qualityColor[dim.quality],
                        }}
                      />
                    </div>
                    <span
                      className="text-[12px] font-bold w-20 text-right"
                      style={{ color: qualityColor[dim.quality] }}
                    >
                      {qualityLabel[dim.quality]}
                    </span>
                  </div>
                </div>
                <p className="text-[13px] text-slate-mid leading-relaxed">{dim.feedback}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#111111] border border-white/10 rounded-2xl p-6 mb-8">
          <h3 className="font-display font-bold text-[12px] uppercase tracking-widest text-slate-mid mb-3">
            What to work on
          </h3>
          {result.dimensionScores
            .filter((d) => d.quality === 'developing')
            .map((dim) => (
              <div key={dim.dimension} className="flex items-start gap-3 mb-3 last:mb-0">
                <span className="text-red-400 mt-0.5">→</span>
                <span className="text-[14px] text-[#f5f3ee] font-light">{dim.dimension}</span>
              </div>
            ))}
          {result.dimensionScores.every((d) => d.quality !== 'developing') && (
            <p className="text-[14px] text-[#f5f3ee] font-light">
              No critical gaps identified. Try a harder track to push your ceiling.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(`/scenario/${scenarioId}/briefing`)}
            className="text-[13px] text-slate-mid hover:text-[#f5f3ee] transition-colors"
          >
            Retry this scenario
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-green hover:bg-green-light text-white font-display font-semibold text-[14px] px-8 py-3 rounded-lg transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
