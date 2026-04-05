import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Nav } from '@/components/Nav'
import { ChoiceCard } from '@/components/ChoiceCard'
import { ContextPanel } from '@/components/ContextPanel'
import { useSimulation } from '@/hooks/useSimulation'
import { scenarios, trackMeta } from '@/lib/scenarios'
import type { Scenario } from '@id/types'

export function SimulationPage() {
  const { scenarioId } = useParams<{ scenarioId: string }>()
  const navigate = useNavigate()
  const scenario = scenarios.find((s) => s.scenarioId === scenarioId)

  useEffect(() => {
    if (!scenario) {
      navigate('/dashboard')
    }
  }, [scenario, navigate])

  if (!scenario) return null

  return <SimulationContent scenario={scenario} scenarioId={scenarioId!} />
}

function SimulationContent({ scenario, scenarioId }: { scenario: Scenario; scenarioId: string }) {
  const navigate = useNavigate()
  const meta = trackMeta[scenario.track]

  const {
    currentNode,
    selectedChoice,
    setSelectedChoice,
    submitChoice,
    advanceTransition,
    isTransitioning,
    isComplete,
    stepNumber,
    totalDecisionNodes,
    computeResult,
  } = useSimulation(scenario)

  useEffect(() => {
    if (isComplete) {
      const result = computeResult()
      sessionStorage.setItem(`result-${scenarioId}`, JSON.stringify(result))
      setTimeout(() => navigate(`/scenario/${scenarioId}/feedback`), 600)
    }
  }, [isComplete, scenarioId, navigate, computeResult])

  if (isComplete) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="text-4xl mb-4">✓</div>
          <p className="font-display font-bold text-[18px] text-[#0a0a0a]">Evaluating your responses...</p>
        </div>
      </div>
    )
  }

  const stepLabel =
    currentNode.type === 'decision'
      ? `Step ${stepNumber} of ${totalDecisionNodes}`
      : 'Outcome'

  return (
    <div className={`min-h-screen bg-cream transition-opacity duration-300 ${isTransitioning ? 'opacity-50' : 'opacity-100'}`}>
      <Nav trackLabel={meta.label} stepLabel={stepLabel} />

      {currentNode.type === 'transition' && (
        <div className="max-w-2xl mx-auto px-6 py-16 animate-fade-in">
          <div className="bg-[#0a0a0a] rounded-2xl p-8 mb-8">
            <div
              className="text-[11px] font-bold uppercase tracking-widest mb-4"
              style={{ color: meta.color === '#1a6b3c' ? '#2d9e5f' : meta.color }}
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
              className="bg-[#0a0a0a] hover:bg-slate text-white font-display font-semibold text-[14px] px-8 py-3 rounded-lg transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {currentNode.type === 'decision' && (
        <div className="max-w-5xl mx-auto px-6 py-8 animate-slide-up">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
            <div>
              <div className="bg-white rounded-2xl border border-border shadow-card p-6 mb-5">
                <p className="text-[15px] text-[#0a0a0a] leading-[1.75] font-light">
                  {currentNode.narrative}
                </p>
              </div>

              {currentNode.contextPanels && currentNode.contextPanels.length > 0 && (
                <div className="mb-5">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-3">
                    Live Metrics
                  </p>
                  <ContextPanel panels={currentNode.contextPanels} />
                </div>
              )}
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
                      ? 'bg-[#0a0a0a] text-white hover:bg-slate cursor-pointer'
                      : 'bg-border text-slate-light cursor-not-allowed'
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
    </div>
  )
}
