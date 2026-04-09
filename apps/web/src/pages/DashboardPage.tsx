import { useNavigate } from 'react-router-dom'
import { useAuth, useUser } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { TrackIcon } from '@/components/TrackIcon'
import { useScenarios } from '@/hooks/useScenarios'

export function DashboardPage() {
  const navigate = useNavigate()
  const { isSignedIn } = useAuth()
  const { user } = useUser()
  const { scenarios, trackMeta, isLoading, error } = useScenarios()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-slate-mid text-[14px]">Loading simulations...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-red-400 text-[14px]">Failed to load simulations. Please try again.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav />

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
          <div>
            <p className="text-[12px] font-medium tracking-widest uppercase text-slate-mid mb-1">
              {isSignedIn ? 'Welcome back' : 'Explore simulations'}
            </p>
            <h2 className="font-display font-extrabold text-[32px] text-[#f5f3ee] tracking-tight">
              {isSignedIn ? (user?.fullName ?? user?.firstName ?? 'Welcome') : 'Choose a scenario'}
            </h2>
          </div>
          {/* Cohort badge — hidden until cohort assignment is implemented */}
        </div>

        <div className="mb-10">
          <h3 className="font-display font-bold text-[13px] uppercase tracking-widest text-slate-mid mb-5">
            Simulation Tracks
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {scenarios.map((scenario) => {
              const meta = trackMeta[scenario.track]
              if (!meta) return null
              return (
                <div
                  key={scenario.scenarioId}
                  className="bg-[#111111] rounded-2xl border border-white/10 hover:border-white/20 transition-all hover:-translate-y-0.5 overflow-hidden cursor-pointer group"
                  onClick={() => navigate(`/scenario/${scenario.scenarioId}/briefing`)}
                >
                  <div className="h-2 w-full" style={{ backgroundColor: meta.color }} />
                  <div className="p-6">
                    <div className="mb-4">
                      <TrackIcon name={meta.icon} size={28} color={meta.color} />
                    </div>
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

        {isSignedIn && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => navigate('/builder')}
              className="text-[13px] font-semibold text-[#2d9e5f] hover:text-[#2d9e5f]/80 transition-colors underline-offset-2 hover:underline"
            >
              Build a scenario →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
