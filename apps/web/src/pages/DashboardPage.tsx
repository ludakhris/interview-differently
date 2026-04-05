import { useNavigate } from 'react-router-dom'
import { Nav } from '@/components/Nav'
import { scenarios, trackMeta } from '@/lib/scenarios'

export function DashboardPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav />

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
          <div>
            <p className="text-[12px] font-medium tracking-widest uppercase text-slate-mid mb-1">
              Welcome back
            </p>
            <h2 className="font-display font-extrabold text-[32px] text-[#f5f3ee] tracking-tight">
              Jordan Davis
            </h2>
          </div>
          <div className="flex items-center gap-2 bg-green/10 border border-green/30 rounded-lg px-4 py-2">
            <span className="w-2 h-2 rounded-full bg-green-light animate-pulse" />
            <span className="text-[13px] font-medium text-green-light">Spring 2026 Cohort</span>
          </div>
        </div>

        <div className="mb-10">
          <h3 className="font-display font-bold text-[13px] uppercase tracking-widest text-slate-mid mb-5">
            Simulation Tracks
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {scenarios.map((scenario) => {
              const meta = trackMeta[scenario.track]
              return (
                <div
                  key={scenario.scenarioId}
                  className="bg-[#111111] rounded-2xl border border-white/10 hover:border-white/20 transition-all hover:-translate-y-0.5 overflow-hidden cursor-pointer group"
                  onClick={() => navigate(`/scenario/${scenario.scenarioId}/briefing`)}
                >
                  <div
                    className="h-2 w-full"
                    style={{ backgroundColor: meta.color }}
                  />
                  <div className="p-6">
                    <div className="text-3xl mb-4">{meta.icon}</div>
                    <div
                      className="text-[10px] font-bold uppercase tracking-widest mb-2"
                      style={{ color: meta.color }}
                    >
                      {meta.label}
                    </div>
                    <h4 className="font-display font-bold text-[16px] text-[#f5f3ee] leading-snug mb-3">
                      {scenario.title}
                    </h4>
                    <p className="text-[13px] text-slate-mid leading-relaxed mb-5">
                      {meta.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-slate-light">
                        ~{scenario.estimatedMinutes} min
                      </span>
                      <span
                        className="text-[12px] font-semibold group-hover:translate-x-1 transition-transform inline-block"
                        style={{ color: meta.color }}
                      >
                        Start →
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-[#111111] rounded-2xl border border-white/10 p-6">
          <h3 className="font-display font-bold text-[13px] uppercase tracking-widest text-slate-mid mb-4">
            Competency Profile
          </h3>
          <div className="flex items-center gap-3 text-slate-mid">
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[16px]">
              📈
            </div>
            <p className="text-[14px]">
              Complete a simulation to see your competency scores appear here.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
