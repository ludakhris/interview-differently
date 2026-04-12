import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Nav } from '@/components/Nav'
import { TrackIcon } from '@/components/TrackIcon'
import { useScenario, useScenarios } from '@/hooks/useScenarios'

export function BriefingPage() {
  const { scenarioId } = useParams<{ scenarioId: string }>()
  const navigate = useNavigate()
  const { scenario, isLoading } = useScenario(scenarioId)
  const { trackMeta } = useScenarios()

  useEffect(() => {
    if (!isLoading && !scenario) {
      navigate('/dashboard')
    }
  }, [isLoading, scenario, navigate])

  if (isLoading || !scenario) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-slate-mid text-[14px]">Loading...</p>
      </div>
    )
  }

  const meta = trackMeta[scenario.track]
  const { briefing } = scenario

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav trackLabel={meta?.label} />

      <div className="max-w-2xl mx-auto px-6 py-14 animate-fade-in">
        <div
          className="text-[11px] font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5"
          style={{ color: meta?.color }}
        >
          {meta && <TrackIcon name={meta.icon} size={12} color={meta.color} className="inline -mt-0.5" />}
          {meta?.label} Track
        </div>

        <h1 className="font-display font-extrabold text-[28px] text-[#f5f3ee] tracking-tight leading-snug mb-8">
          {scenario.title}
        </h1>

        {briefing.situation && (
          <div className="bg-[#111111] rounded-2xl border border-white/10 p-6 mb-6">
            <h3 className="font-display font-bold text-[12px] uppercase tracking-widest text-slate-mid mb-4">
              The Situation
            </h3>
            <p className="text-[15px] text-[#f5f3ee] leading-relaxed font-light">{briefing.situation}</p>
          </div>
        )}

        <div className="bg-[#111111] rounded-2xl border border-white/10 p-6 mb-6">
          <h3 className="font-display font-bold text-[12px] uppercase tracking-widest text-slate-mid mb-4">
            Your Role
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Position', value: briefing.role },
              { label: 'Organisation', value: briefing.organisation },
              { label: 'Reports to', value: briefing.reportsTo },
              { label: 'Time in role', value: briefing.timeInRole },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <span className="text-[12px] font-medium text-slate-mid w-28 flex-shrink-0 pt-0.5">
                  {label}
                </span>
                <span className="text-[14px] text-[#f5f3ee] font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#111111] rounded-2xl border border-white/10 p-6 mb-6">
          <h3 className="font-display font-bold text-[12px] uppercase tracking-widest text-slate-mid mb-4">
            What You Will Be Evaluated On
          </h3>
          <div className="space-y-3">
            {scenario.rubric.dimensions.map((dim) => (
              <div key={dim.name} className="flex items-start gap-3">
                <span
                  className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: meta?.color }}
                />
                <div>
                  <div className="text-[14px] font-semibold text-[#f5f3ee]">{dim.name}</div>
                  <div className="text-[12px] text-slate-mid leading-relaxed">{dim.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-amber/10 border border-amber/20 rounded-xl p-4 mb-8">
          <p className="text-[13px] text-amber leading-relaxed">
            <strong>How it works:</strong> You will move through a real workplace scenario and make decisions at each step. There are no trick questions. The AI evaluates the reasoning behind your choices, not just which answer you pick.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-[13px] text-slate-mid hover:text-[#f5f3ee] transition-colors"
          >
            Back to dashboard
          </button>
          <button
            onClick={() => navigate(
              scenario.mode === 'immersive'
                ? `/scenario/${scenarioId}/immersive`
                : `/scenario/${scenarioId}/play`
            )}
            className="bg-green hover:bg-green-light text-white font-display font-semibold text-[14px] px-8 py-3 rounded-lg transition-colors tracking-wide"
          >
            {scenario.mode === 'immersive' ? 'Begin Interview' : 'Begin Simulation'}
          </button>
        </div>
      </div>
    </div>
  )
}
