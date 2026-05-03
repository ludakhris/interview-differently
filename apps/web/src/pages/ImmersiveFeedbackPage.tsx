import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import {
  fetchImmersiveSession,
  fetchImmersiveSummary,
  fetchImmersiveResponse,
  fetchResponseMediaUrl,
} from '@/services/immersiveService'
import { useScenario } from '@/hooks/useScenarios'
import type { ImmersiveSummary, ImmersiveResponse } from '@id/types'

const recommendationLabel: Record<string, string> = {
  'strong yes': 'Strong Yes',
  yes: 'Yes',
  maybe: 'Maybe',
  no: 'No',
}

const recommendationColor: Record<string, string> = {
  'strong yes': 'text-green border-green/30 bg-green/10',
  yes: 'text-green border-green/20 bg-green/5',
  maybe: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
  no: 'text-red-400 border-red-500/30 bg-red-500/10',
}

type MediaState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error'; message: string }

export function ImmersiveFeedbackPage() {
  const { scenarioId, sessionId } = useParams<{ scenarioId: string; sessionId: string }>()
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const { scenario } = useScenario(scenarioId)

  const [summary, setSummary] = useState<ImmersiveSummary | null>(null)
  const [responses, setResponses] = useState<ImmersiveResponse[]>([])
  const [summaryStatus, setSummaryStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [mediaByResponse, setMediaByResponse] = useState<Record<string, MediaState>>({})

  useEffect(() => {
    if (!sessionId) { navigate('/dashboard'); return }

    // Fetch session (gives us response list) and summary in parallel
    Promise.all([
      fetchImmersiveSession(sessionId).then(s => setResponses(s.responses ?? [])),
      fetchImmersiveSummary(sessionId).then(s => { setSummary(s); setSummaryStatus('ready') }),
    ]).catch(() => setSummaryStatus('failed'))
  }, [sessionId, navigate])

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        // If not yet fetched, try to fetch feedback for this response
        const existing = responses.find(r => r.id === id)
        if ((!existing || !existing.aiFeedback) && sessionId) {
          fetchImmersiveResponse(sessionId, id)
            .then(r => setResponses(prev => {
              const exists = prev.find(x => x.id === r.id)
              return exists ? prev.map(x => x.id === r.id ? r : x) : [...prev, r]
            }))
            .catch(() => {/* graceful — accordion content will show loading state */})
        }
        // Fetch a signed playback URL for this response if it has audio. Skip
        // if we've already loaded it (state cached) or if there's no media key.
        if (sessionId && existing?.mediaUrl && !mediaByResponse[id]) {
          setMediaByResponse(prev => ({ ...prev, [id]: { status: 'loading' } }))
          getToken()
            .then(token => {
              if (!token) throw new Error('Not signed in')
              return fetchResponseMediaUrl(sessionId, id, token)
            })
            .then(({ url }) => setMediaByResponse(prev => ({ ...prev, [id]: { status: 'ready', url } })))
            .catch(err => setMediaByResponse(prev => ({
              ...prev,
              [id]: { status: 'error', message: err instanceof Error ? err.message : 'Playback unavailable' },
            })))
        }
      }
      return next
    })
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (summaryStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
        <Nav />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-[14px] text-slate-mid">Generating interview assessment…</p>
        </div>
      </div>
    )
  }

  const rec = summary?.hiringRecommendation ?? 'maybe'
  const recClass = recommendationColor[rec] ?? recommendationColor.maybe

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Nav trackLabel={scenario?.title} />

      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8 w-full">

        {/* Header */}
        <div className="animate-fade-in">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-2">
            Interview Feedback
          </p>
          <h1 className="font-display font-bold text-[24px] text-[#f5f3ee] mb-1">
            {scenario?.title ?? 'Interview Complete'}
          </h1>
        </div>

        {/* Summary card */}
        {summary && summaryStatus === 'ready' ? (
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-6 space-y-5 animate-fade-in">
            {/* Hiring recommendation */}
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">
                Hiring Recommendation
              </p>
              <span className={`text-[13px] font-semibold px-3 py-1 rounded-full border ${recClass}`}>
                {recommendationLabel[rec] ?? rec}
              </span>
            </div>

            {/* Overall assessment */}
            <p className="text-[14px] text-[#f5f3ee] leading-relaxed">
              {summary.overallAssessment}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Strengths */}
              <div className="rounded-xl bg-green/5 border border-green/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-green mb-3">
                  Strengths
                </p>
                <ul className="space-y-1.5">
                  {summary.strengths.map((s, i) => (
                    <li key={i} className="text-[13px] text-[#f5f3ee]/80 flex gap-2">
                      <span className="text-green mt-0.5 flex-shrink-0">+</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Development areas */}
              <div className="rounded-xl bg-amber-400/5 border border-amber-400/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-3">
                  Development Areas
                </p>
                <ul className="space-y-1.5">
                  {summary.developmentAreas.map((d, i) => (
                    <li key={i} className="text-[13px] text-[#f5f3ee]/80 flex gap-2">
                      <span className="text-amber-400 mt-0.5 flex-shrink-0">→</span>
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-6 text-center text-slate-mid text-[14px]">
            Summary unavailable — try refreshing the page.
          </div>
        )}

        {/* Per-response accordion — populated only if we have response IDs */}
        {responses.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid">
              Question-by-Question Feedback
            </p>
            {responses.map((resp) => {
              const isOpen = expandedIds.has(resp.id)
              const fb = resp.aiFeedback
              return (
                <div
                  key={resp.id}
                  className="rounded-xl border border-white/10 bg-[#111111] overflow-hidden"
                >
                  <button
                    onClick={() => toggleExpand(resp.id)}
                    className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left hover:bg-white/5 transition-colors"
                  >
                    <p className="text-[14px] text-[#f5f3ee] leading-snug flex-1">
                      {resp.questionText}
                    </p>
                    <span className={`text-slate-mid text-[18px] mt-0.5 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                      ›
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 space-y-3 border-t border-white/10 pt-4 animate-fade-in">
                      {/* Recording playback (private — signed URL fetched on expand) */}
                      {resp.mediaUrl && (() => {
                        const m = mediaByResponse[resp.id]
                        if (!m || m.status === 'loading') {
                          return (
                            <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2.5">
                              <p className="text-[11px] text-slate-mid">Loading recording…</p>
                            </div>
                          )
                        }
                        if (m.status === 'error') {
                          return (
                            <div className="rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2.5">
                              <p className="text-[11px] text-red-400">{m.message}</p>
                            </div>
                          )
                        }
                        return (
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-2">
                              Your Recording
                            </p>
                            <video
                              src={m.url}
                              controls
                              playsInline
                              className="w-full rounded-lg bg-black/50 max-h-72"
                            />
                          </div>
                        )
                      })()}

                      {/* Transcript */}
                      {resp.transcript && (
                        <details className="group">
                          <summary className="text-[11px] font-bold uppercase tracking-widest text-slate-mid cursor-pointer select-none group-open:mb-2">
                            Transcript ›
                          </summary>
                          <p className="text-[13px] text-slate-light leading-relaxed italic">
                            "{resp.transcript}"
                          </p>
                        </details>
                      )}

                      {/* AI feedback */}
                      {fb ? (
                        <div className="space-y-2">
                          <p className="text-[13px] text-[#f5f3ee] leading-relaxed">{fb.feedback}</p>
                          <div className="grid grid-cols-2 gap-3 pt-1">
                            <div className="rounded-lg bg-green/5 border border-green/20 px-3 py-2">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-green mb-1">What worked</p>
                              <p className="text-[12px] text-[#f5f3ee]/80">{fb.strengths}</p>
                            </div>
                            <div className="rounded-lg bg-amber-400/5 border border-amber-400/20 px-3 py-2">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-1">To improve</p>
                              <p className="text-[12px] text-[#f5f3ee]/80">{fb.development}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[13px] text-slate-mid">Loading feedback…</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => navigate(`/scenario/${scenarioId}/immersive`)}
            className="px-5 py-2.5 rounded-lg border border-white/10 text-slate-light hover:text-white text-[13px] font-medium transition-colors"
          >
            Redo interview
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-5 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#f5f3ee] text-[13px] font-medium transition-colors"
          >
            Back to dashboard
          </button>
        </div>

      </div>
    </div>
  )
}
