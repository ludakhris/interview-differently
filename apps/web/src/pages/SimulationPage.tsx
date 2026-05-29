import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { ChoiceCard } from '@/components/ChoiceCard'
import { ContextPanel } from '@/components/ContextPanel'
import { MetricChart } from '@/components/MetricChart'
import { ScenarioSidebar } from '@/components/ScenarioSidebar'
import { PreviewGate } from '@/components/PreviewGate'
import { PhaseStepper } from '@/components/PhaseStepper'
import { ExhibitsColumn } from '@/components/ExhibitsColumn'
import { KeyDataPanel, isKeyDataLayout } from '@/components/keydata/KeyDataPanel'
import { saveResult, recordSimulationAttempt } from '@/services/resultsService'
import { useSimulation } from '@/hooks/useSimulation'
import { useScenario, useScenarios } from '@/hooks/useScenarios'
import { buildPhaseViews, getPhaseForNode } from '@/lib/phases'
import type { Scenario } from '@id/types'
import type { TrackMeta } from '@/hooks/useScenarios'

export function SimulationPage() {
  const { scenarioId } = useParams<{ scenarioId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isPreview = searchParams.get('builderPreview') === 'true'

  const { scenario: liveScenario, isLoading } = useScenario(scenarioId)
  const { trackMeta } = useScenarios()

  // In preview mode, load the scenario from sessionStorage (saved by BuilderCanvasPage)
  const previewScenario = useMemo<Scenario | null>(() => {
    if (!isPreview || !scenarioId) return null
    try {
      const stored = sessionStorage.getItem(`builder-preview-${scenarioId}`)
      return stored ? (JSON.parse(stored) as Scenario) : null
    } catch {
      return null
    }
  }, [isPreview, scenarioId])

  const scenario = isPreview ? previewScenario : liveScenario

  useEffect(() => {
    if (!isLoading && !scenario) {
      navigate('/dashboard')
    }
  }, [isLoading, scenario, navigate])

  if ((isLoading && !isPreview) || !scenario) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-slate-mid text-[14px]">Loading simulation...</p>
      </div>
    )
  }

  return (
    <SimulationContent
      scenario={scenario}
      scenarioId={scenarioId!}
      trackMeta={trackMeta}
      isPreview={isPreview}
    />
  )
}

const contextSectionLabel: Record<string, string> = {
  monitor: 'Live Metrics',
  table: 'Key Data',
  finding: 'Security Finding',
  'tile-grid': 'Key Data',
  'hero-list': 'Key Data',
  'context-cards': 'Key Data',
  'briefing-sections': 'Briefing',
}

function SimulationContent({
  scenario,
  scenarioId,
  trackMeta,
  isPreview = false,
}: {
  scenario: Scenario
  scenarioId: string
  trackMeta: Record<string, TrackMeta>
  isPreview?: boolean
}) {
  const navigate = useNavigate()
  const meta = trackMeta[scenario.track]

  const { isSignedIn, isLoaded, userId } = useAuth()

  // Record one attempt per page mount, regardless of how many times React
  // re-runs the effect (StrictMode double-mount in dev would otherwise
  // create two attempts and skew completion rate).
  const attemptRecorded = useRef(false)
  useEffect(() => {
    if (isPreview) return
    if (!isLoaded || !isSignedIn || !userId || !scenarioId) return
    if (attemptRecorded.current) return
    attemptRecorded.current = true
    void recordSimulationAttempt({ userId, scenarioId, track: scenario.track })
  }, [isLoaded, isSignedIn, userId, scenarioId, scenario.track, isPreview])

  const {
    currentNode,
    selectedChoice,
    setSelectedChoice,
    submitChoice,
    advanceTransition,
    isComplete,
    stepNumber,
    totalDecisionNodes,
    computeResult,
    choicesMade,
  } = useSimulation(scenario)

  // Show the preview gate after the first decision is submitted, for unauthenticated visitors
  const isGated = isLoaded && !isSignedIn && !isPreview && Object.keys(choicesMade).length >= 1

  useEffect(() => {
    if (isComplete) {
      if (isPreview) {
        // Preview mode: skip writing results; return to builder canvas
        setTimeout(() => navigate(`/builder/${scenarioId}`), 600)
      } else {
        const result = computeResult()
        sessionStorage.setItem(`result-${scenarioId}`, JSON.stringify(result))
        if (isSignedIn) void saveResult({ ...result, scenarioTitle: scenario.title })
        setTimeout(() => navigate(`/scenario/${scenarioId}/feedback`), 600)
      }
    }
  }, [isComplete, isPreview, scenarioId, navigate, computeResult, isSignedIn, scenario.title])

  if (isComplete) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="text-4xl mb-4">✓</div>
          <p className="font-display font-bold text-[18px] text-[#f5f3ee]">
            {isPreview ? 'Preview complete — returning to builder...' : 'Evaluating your responses...'}
          </p>
        </div>
      </div>
    )
  }

  const stepLabel =
    currentNode.type === 'decision'
      ? `Step ${stepNumber} of ${totalDecisionNodes}`
      : 'Outcome'

  const display = scenario.display
  const ctxStyle = display?.contextStyle ?? 'monitor'
  const ctxLabel = contextSectionLabel[ctxStyle] ?? 'Live Metrics'

  // ── Phase + exhibits plumbing ─────────────────────────────────────────────
  const answeredNodeIds = useMemo(() => new Set(Object.keys(choicesMade)), [choicesMade])
  const phaseViews = useMemo(
    () => buildPhaseViews(scenario, currentNode.nodeId, answeredNodeIds),
    [scenario, currentNode.nodeId, answeredNodeIds],
  )
  const currentPhase = useMemo(
    () => getPhaseForNode(scenario, currentNode.nodeId),
    [scenario, currentNode.nodeId],
  )
  // Show the exhibits rail only when the *current* phase actually has
  // exhibits pinned to it. Empty rails read as broken UI; case authors who
  // want an exhibit-free phase (e.g. an early Structure step) shouldn't have
  // to look at an empty column. Mobile trigger follows the same rule.
  const hasPhases = Boolean(scenario.phases?.length)
  const showExhibitsRail =
    hasPhases && (currentPhase?.exhibitIds?.length ?? 0) > 0
  const [mobileExhibitsOpen, setMobileExhibitsOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {isPreview && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 bg-[#1a1a1a] border-t border-amber-500/30">
          <div className="flex items-center gap-2.5">
            <span className="text-amber-400 text-[13px]">◈</span>
            <span className="text-[12px] font-semibold text-amber-400 uppercase tracking-widest">Preview Mode</span>
            <span className="text-[12px] text-white/30">— responses are not saved</span>
          </div>
          <button
            onClick={() => navigate(`/builder/${scenarioId}`)}
            className="text-[12px] font-medium text-white/40 hover:text-white/70 transition-colors"
          >
            ← Back to builder
          </button>
        </div>
      )}
      <Nav trackLabel={meta?.label} stepLabel={stepLabel} />

      {hasPhases && (
        <PhaseStepper phases={phaseViews} accentColor={meta?.color} />
      )}

      <div className="flex flex-1">
        {/* Sidebar — only on lg+ screens */}
        {display && (
          <ScenarioSidebar
            sections={display.sidebar}
            contextStyle={ctxStyle}
            accentColor={meta?.color}
          />
        )}

        {/* Main scrollable content */}
        <div className={`relative flex-1 min-w-0 overflow-y-auto ${isPreview ? 'pb-14' : ''}`}>

          {/* Mobile exhibits toggle — only shown when current phase has exhibits */}
          {showExhibitsRail && (
            <div className="lg:hidden px-4 pt-4">
              <button
                type="button"
                onClick={() => setMobileExhibitsOpen(true)}
                className="w-full flex items-center justify-between rounded-lg border border-white/10 bg-[#111111] px-4 py-2.5 text-[12px] font-semibold text-[#f5f3ee]"
              >
                <span>
                  Exhibits
                  {currentPhase && (
                    <span className="ml-2 text-white/40 font-normal">· {currentPhase.label}</span>
                  )}
                </span>
                <span className="text-white/40">↗</span>
              </button>
            </div>
          )}

          {/* Content blurred when gated */}
          <div className={isGated ? 'blur-[2px] pointer-events-none select-none' : ''}>

          {/* ── Transition node ── */}
          {currentNode.type === 'transition' && (
            <div className="max-w-2xl mx-auto px-6 py-16 animate-fade-in">
              <div className="bg-[#111111] border border-white/10 rounded-2xl p-8 mb-8">
                <div
                  className="text-[11px] font-bold uppercase tracking-widest mb-4"
                  style={{ color: meta?.color }}
                >
                  What happened next
                </div>
                <p className="text-[16px] text-[#f5f3ee] leading-relaxed font-light">
                  {currentNode.narrative}
                </p>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={advanceTransition}
                  className="bg-green hover:bg-green-light text-white font-display font-semibold text-[14px] px-8 py-3 rounded-lg transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* ── Decision node ── */}
          {currentNode.type === 'decision' && (
            <div className="max-w-4xl mx-auto px-6 py-8 animate-slide-up">

              {/* Alert banner (ops P1 alert, shown on first step) */}
              {display?.alertBanner && stepNumber === 1 && (
                <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-5">
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

              {/* Context display — full width above narrative */}
              {currentNode.contextPanels && currentNode.contextPanels.length > 0 && (
                <div className="mb-6">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">
                    {ctxLabel}
                  </p>
                  {currentNode.chart && (
                    <MetricChart config={currentNode.chart} />
                  )}
                  {isKeyDataLayout(ctxStyle) ? (
                    <KeyDataPanel
                      layout={ctxStyle}
                      panels={currentNode.contextPanels}
                      accentColor={meta?.color}
                    />
                  ) : (
                    <ContextPanel
                      panels={currentNode.contextPanels}
                      contextStyle={ctxStyle}
                      incidentMeta={display?.incidentMeta}
                    />
                  )}
                </div>
              )}

              {/* Narrative + choices grid */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                <div>
                  <div className="bg-[#111111] rounded-2xl border border-white/10 p-6">
                    <p className="text-[15px] text-[#f5f3ee] leading-[1.75] font-light">
                      {currentNode.narrative}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-3">
                    What do you do?
                  </p>
                  <div className="space-y-3">
                    {currentNode.choices?.map((choice) => (
                      <ChoiceCard
                        key={choice.id}
                        id={choice.id}
                        text={choice.text}
                        selected={selectedChoice === choice.id}
                        onSelect={setSelectedChoice}
                      />
                    ))}
                  </div>

                  <div className="mt-5 flex items-center justify-between">
                    <span className="text-[12px] text-slate-light">
                      {selectedChoice ? 'Ready to submit' : 'Select an action'}
                    </span>
                    <button
                      onClick={() => selectedChoice && submitChoice(selectedChoice)}
                      disabled={!selectedChoice}
                      className={`
                        font-display font-semibold text-[14px] px-7 py-3 rounded-lg transition-all
                        ${selectedChoice
                          ? 'bg-green hover:bg-green-light text-white cursor-pointer'
                          : 'bg-white/10 text-slate-light cursor-not-allowed'
                        }
                      `}
                    >
                      Submit
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}

          </div>{/* end blur wrapper */}

          {/* Preview gate overlay — floats above blurred content */}
          {isGated && <PreviewGate scenarioId={scenarioId} />}

        </div>

        {/* Right exhibits rail — lg+ only, only when current phase has exhibits */}
        {showExhibitsRail && (
          <div className="hidden lg:flex w-[340px] xl:w-[380px] flex-shrink-0">
            <ExhibitsColumn phase={currentPhase} accentColor={meta?.color} />
          </div>
        )}
      </div>

      {/* Mobile exhibits drawer */}
      {showExhibitsRail && mobileExhibitsOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Exhibits"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close exhibits"
            onClick={() => setMobileExhibitsOpen(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 w-[88%] max-w-[420px] flex flex-col bg-[#0d0d0d] border-l border-white/10 shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">
                Exhibits
              </p>
              <button
                type="button"
                onClick={() => setMobileExhibitsOpen(false)}
                className="text-[12px] text-white/60 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ExhibitsColumn phase={currentPhase} accentColor={meta?.color} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
