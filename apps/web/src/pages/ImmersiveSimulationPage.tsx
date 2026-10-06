import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { LtiNav } from '@/components/LtiNav'
import { useLtiBrand } from '@/components/LtiBrandProvider'
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
  fetchImmersiveSession,
  submitImmersiveResponse,
} from '@/services/immersiveService'
import { completeLtiInterview } from '@/services/ltiService'
import { LtiScoreSent } from '@/components/LtiScoreSent'
import { transcriptsReady } from '@/lib/immersiveLti'
import { listScenarioMedia } from '@/services/scenarioMediaService'
import type { ScenarioMediaAsset, ScenarioNode } from '@id/types'

type NarrationMode = 'voice' | 'avatar'
type PageState = 'loading' | 'narrating' | 'responding' | 'submitting' | 'complete' | 'error'

/** How long to wait for the answers to be transcribed before asking the learner to retry. */
const TRANSCRIPT_WAIT_MS = 90_000
const TRANSCRIPT_POLL_MS = 2_000

const contextSectionLabel: Record<string, string> = {
  monitor: 'Live Metrics',
  table: 'Key Data',
  finding: 'Security Finding',
}

/**
 * `ltiMode` (set by /lti/play/:scenarioId for a learner launched from LearnDifferently): no Clerk
 * session, the interview is always voice (browser speech, no avatar clips needed), every question
 * must be answered, nothing links to other pages, and on the last answer the score is requested
 * from the server (which scores the transcripts) and the browser returns to the course.
 */
export function ImmersiveSimulationPage({ ltiMode = false }: { ltiMode?: boolean } = {}) {
  const { scenarioId } = useParams<{ scenarioId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { userId, isLoaded, isSignedIn } = useAuth()
  const { scenario, isLoading } = useScenario(scenarioId)
  const { trackMeta } = useScenarios()
  const narration = useNarration()
  const brand = useLtiBrand()

  const [narrationMode] = useState<NarrationMode>(
    !ltiMode && searchParams.get('mode') === 'avatar' ? 'avatar' : 'voice'
  )

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [nodeIndex, setNodeIndex] = useState(0)
  const [pageState, setPageState] = useState<PageState>('loading')
  const [mediaAssets, setMediaAssets] = useState<ScenarioMediaAsset[] | null>(null)
  const sessionCreatedRef = useRef(false)
  // LTI only: what went wrong, and a counter that remounts the recorder after a failed upload
  const [ltiError, setLtiError] = useState<string | null>(null)
  const [scoreSent, setScoreSent] = useState<{ courseUrl: string | null } | null>(null)
  const [recorderKey, setRecorderKey] = useState(0)
  const [finishing, setFinishing] = useState(false)

  const decisionNodes: ScenarioNode[] = (scenario?.nodes ?? []).filter(
    (n) => n.type === 'decision' && n.responsePrompt
  )

  const currentNode = decisionNodes[nodeIndex] ?? null
  const totalNodes = decisionNodes.length
  const isLastNode = nodeIndex === totalNodes - 1

  const currentAsset =
    currentNode && mediaAssets
      ? (mediaAssets.find((a) => a.nodeId === currentNode.nodeId) ?? null)
      : null
  const currentMediaUrl = currentAsset?.status === 'ready' ? currentAsset.mediaUrl : null

  // Unified "is currently playing narration" across both modes
  const isNarrating = narrationMode === 'voice' ? narration.isPlaying : pageState === 'narrating'

  // Redirect non-immersive scenarios back to normal play
  useEffect(() => {
    if (!ltiMode && !isLoading && scenario && scenario.mode !== 'immersive') {
      navigate(`/scenario/${scenarioId}/play`, { replace: true })
    }
  }, [ltiMode, isLoading, scenario, scenarioId, navigate])

  // Hydrate pre-rendered avatar clips for this scenario (avatar mode only).
  useEffect(() => {
    if (!scenarioId || narrationMode !== 'avatar') return
    listScenarioMedia(scenarioId)
      .then(setMediaAssets)
      .catch(() => setMediaAssets([]))
  }, [scenarioId, narrationMode])

  // Create the session once auth is loaded, then show mode selection
  const startSession = useCallback(() => {
    if (!scenarioId) return
    createImmersiveSession(scenarioId, userId ?? 'lti')
      .then((session) => {
        setSessionId(session.id)
        setPageState('narrating')
      })
      .catch(() => {
        if (ltiMode) {
          // answers cannot be saved without a session, so never carry on without one
          setLtiError('We could not start your interview. Check your connection and try again.')
          setPageState('error')
        } else setPageState('narrating') // gracefully continue without session
      })
  }, [scenarioId, userId, ltiMode])

  useEffect(() => {
    if (!ltiMode && (!isLoaded || !isSignedIn)) return
    if (!scenarioId || sessionCreatedRef.current) return
    if (!ltiMode && !userId) return
    sessionCreatedRef.current = true
    startSession()
  }, [ltiMode, isLoaded, isSignedIn, userId, scenarioId, startSession])

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
    setPageState((prev) => (prev === 'narrating' ? 'responding' : prev))
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
        } else if (ltiMode) {
          throw new Error('no session')
        }
      } catch {
        if (ltiMode) {
          // the answer was not saved: ask for it again instead of moving on without it
          setLtiError('Your answer could not be uploaded. Please record it again.')
          setRecorderKey((k) => k + 1)
          setPageState('responding')
          return
        }
        // Don't block the flow on a submission failure
      }
      setLtiError(null)

      advanceOrFinish()
    },
    [currentNode, sessionId, nodeIndex, ltiMode] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleSkip = useCallback(() => {
    advanceOrFinish()
  }, [nodeIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  // LTI: wait for the answers to be transcribed, then have the server score them and post the
  // score to the course. Safe to repeat: a failure leaves nothing sent and Retry runs it again.
  const finishLti = useCallback(async () => {
    if (!sessionId) return
    setLtiError(null)
    setFinishing(true)
    setPageState('complete')
    try {
      const nodeIds = decisionNodes.map((n) => n.nodeId)
      const deadline = Date.now() + TRANSCRIPT_WAIT_MS
      for (;;) {
        const session = await fetchImmersiveSession(sessionId)
        if (transcriptsReady(session.responses, nodeIds)) break
        if (Date.now() > deadline) {
          throw new Error(
            'We could not finish transcribing your answers. Check your connection and try again.'
          )
        }
        await new Promise((r) => setTimeout(r, TRANSCRIPT_POLL_MS))
      }
      const done = await completeLtiInterview(sessionId)
      if (!done.ok) throw new Error('Score hand-back was not accepted')
      if (done.navigateTo) {
        window.location.assign(done.navigateTo)
      } else {
        setScoreSent({ courseUrl: done.courseUrl })
        setFinishing(false)
      }
    } catch (err) {
      console.warn('LTI score hand-back failed:', err)
      setLtiError(
        err instanceof Error && err.message.startsWith('We could not')
          ? err.message
          : 'Your answers are finished, but your score has not reached your course yet. Check your connection and try again.'
      )
      setFinishing(false)
    }
  }, [sessionId, decisionNodes])

  function advanceOrFinish() {
    if (isLastNode && ltiMode) {
      void finishLti()
    } else if (isLastNode) {
      setPageState('complete')
      const target = sessionId
        ? `/scenario/${scenarioId}/immersive/${sessionId}/feedback`
        : `/dashboard`
      setTimeout(() => navigate(target), 800)
    } else {
      setNodeIndex((i) => i + 1)
      setPageState('narrating')
    }
  }

  // ── LTI: the session could not start ───────────────────────────────────────
  if (ltiMode && pageState === 'error') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p className="text-fg text-[15px] mb-6">{ltiError}</p>
          <button
            onClick={() => {
              setPageState('loading')
              startSession()
            }}
            className="bg-green hover:bg-green-light text-on-primary font-display font-semibold text-[14px] px-8 py-3 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (ltiMode && !isLoading && !scenario) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-6">
        <p className="text-fg text-[15px] text-center max-w-md">
          We could not load this scenario. Go back to your course and start again.
        </p>
      </div>
    )
  }
  if (isLoading || !scenario || pageState === 'loading') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <p className="text-slate-mid text-[14px]">Preparing interview…</p>
      </div>
    )
  }

  // ── Complete ───────────────────────────────────────────────────────────────
  if (ltiMode && pageState === 'complete') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-6">
        <div className="text-center animate-fade-in max-w-md">
          {scoreSent ? (
            <LtiScoreSent courseUrl={scoreSent.courseUrl} />
          ) : finishing || !ltiError ? (
            <p className="font-display font-bold text-[18px] text-fg">Sending your score...</p>
          ) : (
            <>
              <p className="font-display font-bold text-[18px] text-fg mb-2">
                We could not send your score
              </p>
              <p className="text-[14px] text-slate-mid mb-6">{ltiError}</p>
              <button
                onClick={() => void finishLti()}
                className="bg-green hover:bg-green-light text-on-primary font-display font-semibold text-[14px] px-8 py-3 rounded-lg transition-colors"
              >
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (pageState === 'complete') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="text-4xl mb-4">✓</div>
          <p className="font-display font-bold text-[18px] text-fg">
            Interview complete — generating feedback…
          </p>
        </div>
      </div>
    )
  }

  if (!currentNode) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
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
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Immersive mode badge */}
      <div className="fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
        <div className="mt-2 px-3 py-1 rounded-full bg-surface-alt border border-edge/10 text-[11px] font-semibold text-slate-light uppercase tracking-widest">
          Interview Mode
        </div>
      </div>

      {ltiMode ? (
        <LtiNav trackLabel={meta?.label} stepLabel={stepLabel} />
      ) : (
        <Nav trackLabel={meta?.label} stepLabel={stepLabel} />
      )}

      <div className="flex flex-1">
        {display && (
          <ScenarioSidebar
            sections={display.sidebar}
            contextStyle={ctxStyle}
            accentColor={brand?.accent ?? meta?.color}
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
                  <p className="text-[13px] text-fg/80 leading-relaxed">
                    {display.alertBanner.body}
                  </p>
                </div>
              </div>
            )}

            {/* Data context */}
            {currentNode.contextPanels && currentNode.contextPanels.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink/30 mb-3">
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
                <div className="w-full aspect-video rounded-2xl bg-surface-deep flex items-center justify-center">
                  <p className="text-[12px] text-slate-mid">Loading interviewer…</p>
                </div>
              ) : (
                <div className="w-full aspect-video rounded-2xl bg-surface-deep border border-red-400/30 flex flex-col items-center justify-center gap-2 p-6 text-center">
                  <p className="text-[13px] text-red-400 font-semibold">
                    Interviewer clip unavailable
                  </p>
                  <p className="text-[11px] text-slate-mid leading-relaxed max-w-md">
                    This question's avatar clip wasn't pre-rendered. Ask an admin to render this
                    scenario in the builder before retrying.
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
            <div className="bg-surface-alt rounded-2xl border border-edge/10 p-6">
              <p className="text-[15px] text-fg leading-[1.75] font-light">
                {currentNode.narrative}
              </p>
            </div>

            {/* Question as text: the voice is a convenience, the learner can always read and answer */}
            {ltiMode && isNarrating && pageState === 'narrating' && (
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    narration.stop()
                    setPageState('responding')
                  }}
                  className="px-6 py-2.5 rounded-lg border border-edge/10 text-slate-light hover:text-ink text-[14px] transition-colors"
                >
                  Skip narration and answer
                </button>
              </div>
            )}

            {/* Response prompt */}
            {pageState === 'responding' || pageState === 'submitting' ? (
              <div className="space-y-3">
                <div className="px-4 py-3 rounded-xl bg-ink/5 border border-edge/10">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-1">
                    Your turn
                  </p>
                  <p className="text-[14px] text-fg leading-relaxed">
                    {currentNode.responsePrompt}
                  </p>
                </div>
                {ltiError && (
                  <p className="text-[13px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {ltiError}
                  </p>
                )}
                <ResponseRecorder
                  key={recorderKey}
                  onSubmit={handleResponseSubmit}
                  onSkip={ltiMode ? undefined : handleSkip}
                  disabled={pageState === 'submitting'}
                />
              </div>
            ) : (
              !isNarrating && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setPageState('responding')}
                    className="px-6 py-2.5 rounded-lg bg-green hover:bg-green/90 text-on-primary text-[14px] font-medium transition-colors"
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
