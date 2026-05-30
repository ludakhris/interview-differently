import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth, useUser } from '@clerk/clerk-react'
import { useEffect, useMemo, useState } from 'react'
import { Nav } from '@/components/Nav'
import { Footer } from '@/components/Footer'
import { TrackIcon } from '@/components/TrackIcon'
import { useScenarios } from '@/hooks/useScenarios'
import { useProfile } from '@/hooks/useProfile'
import { fetchImmersiveSessionsForUser, type ImmersiveSessionSummary } from '@/services/immersiveService'
import type { ResultSummary } from '@/services/resultsService'
import type { Scenario } from '@id/types'
import { BUSINESS_CASE_SUBCATEGORY_LABELS } from '@id/types'

// Track order on the dashboard. Tracks not listed here fall to the end alphabetically.
const TRACK_ORDER: string[] = ['business case', 'operations', 'business', 'risk', 'customer-success', 'general']

// Sub-category order within the "business case" track. Anything else trails alphabetically.
const SUBCATEGORY_ORDER: string[] = [
  'market-sizing',
  'profitability',
  'm-and-a',
  'market-entry',
  'pricing',
  'operations-improvement',
  'growth-strategy',
  'competitive-response',
  'diagnostics',
  'valuation',
  'product-launch',
  'customer-segmentation',
]

function compareWithOrder(a: string, b: string, order: string[]): number {
  const ai = order.indexOf(a)
  const bi = order.indexOf(b)
  if (ai === -1 && bi === -1) return a.localeCompare(b)
  if (ai === -1) return 1
  if (bi === -1) return -1
  return ai - bi
}

// Group scenarios by track. For the "business case" track we no longer break
// the cards into per-subcategory sections — instead we flatten them into a
// single grid sorted by subcategory order, so cards with the same
// subcategory cluster naturally without consuming a header row each. The
// subcategory itself is surfaced as a small pill on each card. Other tracks
// keep their flat list (no subcategories declared).
function groupScenarios(scenarios: Scenario[]) {
  const byTrack = new Map<string, Scenario[]>()
  for (const scenario of scenarios) {
    const list = byTrack.get(scenario.track) ?? []
    list.push(scenario)
    byTrack.set(scenario.track, list)
  }
  const tracks = Array.from(byTrack.keys()).sort((a, b) => compareWithOrder(a, b, TRACK_ORDER))
  return tracks.map((track) => {
    const trackScenarios = byTrack.get(track) ?? []
    if (track === 'business case') {
      const sorted = [...trackScenarios].sort((a, b) =>
        compareWithOrder(a.subcategory ?? 'uncategorized', b.subcategory ?? 'uncategorized', SUBCATEGORY_ORDER),
      )
      return { track, scenarios: sorted }
    }
    return { track, scenarios: trackScenarios }
  })
}

function subcategoryLabel(key: string): string {
  if (key === 'uncategorized') return 'Other'
  return (BUSINESS_CASE_SUBCATEGORY_LABELS as Record<string, string>)[key] ?? key
}

export function DashboardPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isSignedIn, userId } = useAuth()
  const { user } = useUser()
  const isAdmin = user?.publicMetadata?.role === 'admin'
  const { scenarios, trackMeta, isLoading, error } = useScenarios()
  const groupedScenarios = useMemo(() => groupScenarios(scenarios), [scenarios])
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
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
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
        <div className="mb-6 space-y-12">
          <h3 className="font-display font-bold text-[13px] uppercase tracking-widest text-slate-mid">
            Simulation Tracks
          </h3>
          {groupedScenarios.map(({ track, scenarios: trackScenarios }) => {
            const meta = trackMeta[track]
            if (!meta) return null
            return (
              <section key={track}>
                {/* Track header */}
                <div className="flex items-start gap-3 mb-5">
                  <div className="mt-0.5">
                    <TrackIcon name={meta.icon} size={22} color={meta.color} />
                  </div>
                  <div className="flex-1">
                    <h4
                      className="font-display font-extrabold text-[20px] text-[#f5f3ee] leading-tight"
                      style={{ color: meta.color }}
                    >
                      {meta.label}
                    </h4>
                    <p className="text-[13px] text-slate-mid leading-relaxed mt-1 max-w-3xl">
                      {meta.description}
                    </p>
                  </div>
                </div>

                {/* Flat grid — subcategory surfaced as an eyebrow pill on each card.
                    Pre-sorted by SUBCATEGORY_ORDER in groupScenarios so similar
                    cards still cluster visually without per-section headers. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {trackScenarios.map((scenario) => {
                    const iconName = scenario.icon ?? meta.icon
                    return (
                      <div
                        key={scenario.scenarioId}
                        className="bg-[#111111] rounded-2xl border border-white/10 hover:border-white/20 transition-all hover:-translate-y-0.5 overflow-hidden cursor-pointer group"
                        onClick={() => navigate(`/scenario/${scenario.scenarioId}/briefing`)}
                      >
                        <div className="h-1.5 w-full" style={{ backgroundColor: meta.color }} />
                        <div className="p-5">
                          <div className="flex items-start gap-3 mb-2">
                            <div
                              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                              style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
                            >
                              <TrackIcon name={iconName} size={20} />
                            </div>
                            <div className="min-w-0 flex-1">
                              {scenario.subcategory && (
                                <p
                                  className="text-[10px] font-bold uppercase tracking-[0.18em]"
                                  style={{ color: meta.color }}
                                >
                                  {subcategoryLabel(scenario.subcategory)}
                                </p>
                              )}
                              <h4 className="mt-0.5 font-display font-bold text-[15px] text-[#f5f3ee] leading-snug">
                                {scenario.title}
                              </h4>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-light">
                              ~{scenario.estimatedMinutes} min
                            </span>
                            <span
                              className="text-[11px] font-semibold group-hover:translate-x-1 transition-transform inline-block"
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
              </section>
            )
          })}
        </div>

        {/* ── Custom-scenario CTA ── */}
        <button
          onClick={() => navigate('/request-scenario')}
          className="w-full mb-10 rounded-2xl border border-dashed border-white/15 hover:border-green/40 bg-[#0d0d0d] hover:bg-[#101510] transition-all px-6 py-5 text-left flex items-center justify-between gap-4 group"
        >
          <div>
            <p className="font-display font-bold text-[15px] text-[#f5f3ee] mb-1">
              Don't see what you need?
            </p>
            <p className="text-[13px] text-slate-mid leading-relaxed">
              Tell us about your scenario and we'll build a custom one for you.
            </p>
          </div>
          <span className="text-[13px] font-semibold text-green group-hover:translate-x-1 transition-transform whitespace-nowrap">
            Request a scenario →
          </span>
        </button>

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

        {isSignedIn && isAdmin && (
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

      <div className="flex-1" />
      <Footer />
    </div>
  )
}
