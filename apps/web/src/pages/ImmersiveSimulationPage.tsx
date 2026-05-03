import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { ContextPanel } from '@/components/ContextPanel'
import { MetricChart } from '@/components/MetricChart'
import { ScenarioSidebar } from '@/components/ScenarioSidebar'
import { NarrationPlayer } from '@/components/immersive/NarrationPlayer'
import { PrerenderedAvatarPlayer } from '@/components/immersive/PrerenderedAvatarPlayer'
import { ResponseRecorder, type RecordingResult } from '@/components/immersive/ResponseRecorder'
import { useScenario, useScenarios } from '@/hooks/useScenarios'
import { useNarration } from '@/hooks/useNarration'
import {
  createImmersiveSession,
  submitImmersiveResponse,
} from '@/services/immersiveService'
import { listScenarioMedia } from '@/services/scenarioMediaService'
import type { ScenarioMediaAsset, ScenarioNode } from '@id/types'

type NarrationMode = 'voice' | 'avatar'
type PageState = 'loading' | 'narrating' | 'responding' | 'submitting' | 'complete'

const contextSectionLabel: Record<string, string> = {
  monitor: 'Live Metrics',
  table: 'Key Data',
  finding: 'Security Finding',
}

export function ImmersiveSimulationPage() {
  const { scenarioId } = useParams<{ scenarioId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { userId, isLoaded, isSignedIn } = useAuth()
  const { scenario, isLoading } = useScenario(scenarioId)
  const { trackMeta } = useScenarios()
  const narration = useNarration()

  const [narrationMode] = useState<NarrationMode>(
    searchParams.get('mode') === 'avatar' ? 'avatar' : 'voice',
  )

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [nodeIndex, setNodeIndex] = useState(0)
  const [pageState, setPageState] = useState<PageState>('loading')
  const [mediaAssets, setMediaAssets] = useState<ScenarioMediaAsset[] | null>(null)
  const sessionCreatedRef = useRef(false)

  const decisionNodes: ScenarioNode[] = (scenario?.nodes ?? []).filter(
    n => n.type === 'decision' && n.responsePrompt,
  )

  const currentNode = decisionNodes[nodeIndex] ?? null
  const totalNodes = decisionNodes.length
  const isLastNode = nodeIndex === totalNodes - 1

  const currentAsset = currentNode && mediaAssets
    ? mediaAssets.find(a => a.nodeId === currentNode.nodeId) ?? null
    : null
  const currentMediaUrl = currentAsset?.status === 'ready' ? currentAsset.mediaUrl : null

  // Unified "is currently playing narration" across both modes
  const isNarrating = narrationMode === 'voice' ? narration.isPlaying : pageState === 'narrating'

  // Redirect non-immersive scenarios back to normal play
  useEffect(() => {
    if (!isLoading && scenario && scenario.mode !== 'immersive') {
      navigate(`/scenario/${scenarioId}/play`, { replace: true })
    }
  }, [isLoading, scenario, scenarioId, navigate])

  // Hydrate pre-rendered avatar clips for this scenario (avatar mode only).
  useEffect(() => {
    if (!scenarioId || narrationMode !== 'avatar') return
    listScenarioMedia(scenarioId)
      .then(setMediaAssets)
      .catch(() => setMediaAssets([]))
  }, [scenarioId, narrationMode])

  // Create the session once auth is loaded, then show mode selection
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !scenarioId || sessionCreatedRef.current) return
    if (!userId) return
    sessionCreatedRef.current = true

    createImmersiveSession(scenarioId, userId)
      .then(session => {
        setSessionId(session.id)
        setPageState('narrating')
      })
      .catch(() => setPageState('narrating')) // gracefully continue without session
  }, [isLoaded, isSignedIn, userId, scenarioId])

  // Auto-play narration when we enter 'narrating' state for a new node.
  // Avatar mode plays a pre-rendered MP4; voice mode falls through to TTS.
  useEffect(() => {
    if (pageState !== 'narrating' || !currentNode) return
    if (narrationMode === 'voice') {
      narration.play(currentNode.audioScript ?? currentNode.narrative)
    }
    // For avatar mode, the PrerenderedAvatarPlayer auto-plays on mediaUrl change —
    // its onDone callback advances pageState below.
  }, [pageState, nodeIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  // Voice mode: transition from narrating → responding when speech ends
  useEffect(() => {
    if (narrationMode !== 'voice') return
    if (pageState === 'narrating' && !narration.isPlaying) {
      setPageState('responding')
    }
  }, [narration.isPlaying, pageState, narrationMode])

  // Avatar mode: called by PrerenderedAvatarPlayer when the clip finishes
  const handleAvatarDone = useCallback(() => {
    setPageState(prev => (prev === 'narrating' ? 'responding' : prev))
  }, [])

  const handleResponseSubmit = useCallback(
    async (result: RecordingResult) => {
      if (!currentNode) return
      setPageState('submitting')

      try {
        if (sessionId) {
          const resp = await submitImmersiveResponse(sessionId, {
            nodeId: currentNode.nodeId,
            questionText: currentNode.responsePrompt ?? currentNode.narrative,
            durationSeconds: result.durationSeconds,
            audioBlob: result.blob,
          })
          void resp
        }
      } catch {
        // Don't block the flow on a submission failure
      }

      advanceOrFinish()
    },
    [currentNode, sessionId, nodeIndex], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleSkip = useCallback(() => {
    advanceOrFinish()
  }, [nodeIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  function advanceOrFinish() {
    if (isLastNode) {
      setPageState('complete')
      const target = sessionId
        ? `/scenario/${scenarioId}/immersive/${sessionId}/feedback`
        : `/dashboard`
      setTimeout(() => navigate(target), 800)
    } else {
      setNodeIndex(i => i + 1)
      setPageState('narrating')
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading || !scenario || pageState === 'loading') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-slate-mid text-[14px]">Preparing interview…</p>
      </div>
    )
  }

  // ── Complete ───────────────────────────────────────────────────────────────
  if (pageState === 'complete') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="text-4xl mb-4">✓</div>
          <p className="font-display font-bold text-[18px] text-[#f5f3ee]">
            Interview complete — generating feedback…
          </p>
        </div>
      </div>
    )
  }

  if (!currentNode) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-slate-mid text-[14px]">
          This scenario has no immersive questions configured.
        </p>
      </div>
    )
  }

  const meta = trackMeta[scenario.track]
  const display = scenario.display
  const ctxStyle = display?.contextStyle ?? 'monitor'
  const ctxLabel = contextSectionLabel[ctxStyle] ?? 'Live Metrics'
  const stepLabel = `Question ${nodeIndex + 1} of ${totalNodes}`

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Immersive mode badge */}
      <div className="fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
        <div className="mt-2 px-3 py-1 rounded-full bg-[#111] border border-white/10 text-[11px] font-semibold text-slate-light uppercase tracking-widest">
          Interview Mode
        </div>
      </div>

      <Nav trackLabel={meta?.label} stepLabel={stepLabel} />

      <div className="flex flex-1">
        {display && (
          <ScenarioSidebar
            sections={display.sidebar}
            contextStyle={ctxStyle}
            accentColor={meta?.color}
          />
        )}

        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-6 animate-fade-in">

            {/* Alert banner on first question */}
            {display?.alertBanner && nodeIndex === 0 && (
              <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                <span className="text-amber-400 text-[18px] flex-shrink-0 mt-0.5">
                  {display.alertBanner.icon}
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-1">
                    {display.alertBanner.title}
                  </p>
                  <p className="text-[13px] text-[#f5f3ee]/80 leading-relaxed">
                    {display.alertBanner.body}
                  </p>
                </div>
              </div>
            )}

            {/* Data context */}
            {currentNode.contextPanels && currentNode.contextPanels.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">
                  {ctxLabel}
                </p>
                {currentNode.chart && <MetricChart config={currentNode.chart} />}
                <ContextPanel
                  panels={currentNode.contextPanels}
                  contextStyle={ctxStyle}
                  incidentMeta={display?.incidentMeta}
                />
              </div>
            )}

            {/* Narration — voice or avatar (avatar plays a pre-rendered MP4 per node) */}
            {narrationMode === 'avatar' ? (
              currentMediaUrl ? (
                <PrerenderedAvatarPlayer
                  mediaUrl={currentMediaUrl}
                  isPlaying={pageState === 'narrating'}
                  onDone={handleAvatarDone}
                  className="w-full aspect-video"
                />
              ) : mediaAssets === null ? (
                <div className="w-full aspect-video rounded-2xl bg-[#0d0d0d] flex items-center justify-center">
                  <p className="text-[12px] text-slate-mid">Loading interviewer…</p>
                </div>
              ) : (
                <div className="w-full aspect-video rounded-2xl bg-[#0d0d0d] border border-red-400/30 flex flex-col items-center justify-center gap-2 p-6 text-center">
                  <p className="text-[13px] text-red-400 font-semibold">Interviewer clip unavailable</p>
                  <p className="text-[11px] text-slate-mid leading-relaxed max-w-md">
                    This question's avatar clip wasn't pre-rendered. Ask an admin to render this scenario in the builder before retrying.
                  </p>
                </div>
              )
            ) : (
              <NarrationPlayer
                isPlaying={narration.isPlaying}
                isMuted={narration.isMuted}
                onToggleMute={narration.toggleMute}
                onReplay={() => {
                  setPageState('narrating')
                  narration.play(currentNode.audioScript ?? currentNode.narrative)
                }}
              />
            )}

            {/* Scenario context text */}
            <div className="bg-[#111111] rounded-2xl border border-white/10 p-6">
              <p className="text-[15px] text-[#f5f3ee] leading-[1.75] font-light">
                {currentNode.narrative}
              </p>
            </div>

            {/* Response prompt */}
            {pageState === 'responding' || pageState === 'submitting' ? (
              <div className="space-y-3">
                <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-1">
                    Your turn
                  </p>
                  <p className="text-[14px] text-[#f5f3ee] leading-relaxed">
                    {currentNode.responsePrompt}
                  </p>
                </div>
                <ResponseRecorder
                  onSubmit={handleResponseSubmit}
                  onSkip={handleSkip}
                  disabled={pageState === 'submitting'}
                />
              </div>
            ) : (
              !isNarrating && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setPageState('responding')}
                    className="px-6 py-2.5 rounded-lg bg-green hover:bg-green/90 text-white text-[14px] font-medium transition-colors"
                  >
                    Ready to respond
                  </button>
                </div>
              )
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
