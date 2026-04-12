import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth, useUser } from '@clerk/clerk-react'
import { useEffect, useState } from 'react'
import { Nav } from '@/components/Nav'
import { TrackIcon } from '@/components/TrackIcon'
import { useScenarios } from '@/hooks/useScenarios'
import { useProfile } from '@/hooks/useProfile'
import { fetchImmersiveSessionsForUser, type ImmersiveSessionSummary } from '@/services/immersiveService'
import type { ResultSummary } from '@/services/resultsService'

export function DashboardPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isSignedIn, userId } = useAuth()
  const { user } = useUser()
  const { scenarios, trackMeta, isLoading, error } = useScenarios()
  const refreshKey = (location.state as { refreshedAt?: number } | null)?.refreshedAt
  const { profile, isLoading: profileLoading } = useProfile(isSignedIn ? userId : null, refreshKey)
  const [immersiveSessions, setImmersiveSessions] = useState<ImmersiveSessionSummary[]>([])

  useEffect(() => {
    if (!isSignedIn || !userId) return
    fetchImmersiveSessionsForUser(userId)
      .then(setImmersiveSessions)
      .catch(() => {/* non-critical */})
  }, [isSignedIn, userId, refreshKey])

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
        </div>

        {/* ── Simulation Tracks ── */}
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

        {/* ── Competency Profile ── */}
        <div className="bg-[#111111] rounded-2xl border border-white/10 p-6 mb-6">
          <h3 className="font-display font-bold text-[13px] uppercase tracking-widest text-slate-mid mb-5">
            Competency Profile
          </h3>
          {!isSignedIn ? (
            <div className="flex items-center gap-3 text-slate-mid">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[16px]">📈</div>
              <p className="text-[14px]">Sign in to track your competency scores.</p>
            </div>
          ) : profileLoading ? (
            <p className="text-[13px] text-slate-mid">Loading profile...</p>
          ) : !profile || profile.dimensionAverages.length === 0 ? (
            <div className="flex items-center gap-3 text-slate-mid">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[16px]">📈</div>
              <p className="text-[14px]">Complete a simulation to see your competency scores appear here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {profile.dimensionAverages.map((dim) => {
                const color = dim.averageScore >= 80 ? '#2d9e5f' : dim.averageScore >= 60 ? '#d4830a' : '#c0392b'
                return (
                  <div key={dim.dimension}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13px] font-semibold text-[#f5f3ee]">{dim.dimension}</span>
                      <span className="text-[13px] font-bold" style={{ color }}>{dim.averageScore}</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${dim.averageScore}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Simulation History ── */}
        {isSignedIn && profile && profile.history.length > 0 && (
          <div className="bg-[#111111] rounded-2xl border border-white/10 p-6 mb-6">
            <h3 className="font-display font-bold text-[13px] uppercase tracking-widest text-slate-mid mb-5">
              Simulation History
            </h3>
            <div className="space-y-1">
              {profile.history.map((item: ResultSummary) => {
                const meta = trackMeta[item.track]
                const color = item.overallScore >= 80 ? '#2d9e5f' : item.overallScore >= 60 ? '#d4830a' : '#c0392b'
                const date = new Date(item.completedAt).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-3 border-b border-white/5 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta?.color ?? '#888' }} />
                      <div>
                        <p className="text-[13px] font-semibold text-[#f5f3ee]">{item.scenarioTitle}</p>
                        <p className="text-[11px] text-slate-mid">{date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[13px] font-bold" style={{ color }}>{item.overallScore}</span>
                      <button
                        onClick={() => navigate(`/scenario/${item.scenarioId}/feedback/${item.id}`)}
                        className="text-[11px] text-slate-mid hover:text-[#f5f3ee] transition-colors"
                      >
                        View →
                      </button>
                      <button
                        onClick={() => navigate(`/scenario/${item.scenarioId}/briefing`)}
                        className="text-[11px] text-slate-mid hover:text-[#f5f3ee] transition-colors"
                      >
                        Retry →
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Immersive Interview History ── */}
        {isSignedIn && immersiveSessions.length > 0 && (
          <div className="bg-[#111111] rounded-2xl border border-white/10 p-6 mb-6">
            <h3 className="font-display font-bold text-[13px] uppercase tracking-widest text-slate-mid mb-5">
              Interview Practice History
            </h3>
            <div className="space-y-1">
              {immersiveSessions.map((session) => {
                const date = new Date(session.createdAt).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })
                const statusColor =
                  session.status === 'completed' ? '#2d9e5f' : '#888'
                return (
                  <div
                    key={session.id}
                    className="flex items-center justify-between py-3 border-b border-white/5 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[14px]">🎙</span>
                      <div>
                        <p className="text-[13px] font-semibold text-[#f5f3ee]">
                          {session.scenarioId}
                        </p>
                        <p className="text-[11px] text-slate-mid">
                          {date} · {session._count.responses} response{session._count.responses !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[11px] font-medium capitalize" style={{ color: statusColor }}>
                        {session.status}
                      </span>
                      {session.status === 'completed' && (
                        <button
                          onClick={() => navigate(`/scenario/${session.scenarioId}/immersive/${session.id}/feedback`)}
                          className="text-[11px] text-slate-mid hover:text-[#f5f3ee] transition-colors"
                        >
                          View →
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/scenario/${session.scenarioId}/immersive`)}
                        className="text-[11px] text-slate-mid hover:text-[#f5f3ee] transition-colors"
                      >
                        Retry →
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {isSignedIn && (
          <div className="flex justify-end">
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
