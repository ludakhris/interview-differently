import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { Nav } from '@/components/Nav'
import { TrackIcon } from '@/components/TrackIcon'
import { useScenario, useScenarios } from '@/hooks/useScenarios'

export function BriefingPage() {
  const { scenarioId } = useParams<{ scenarioId: string }>()
  const navigate = useNavigate()
  const { isSignedIn } = useAuth()
  const { scenario, isLoading } = useScenario(scenarioId)
  const { trackMeta } = useScenarios()
  const [narrationMode, setNarrationMode] = useState<'voice' | 'avatar'>('voice')
  const [showSignInPrompt, setShowSignInPrompt] = useState(false)

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
  const immersiveUrl = `/scenario/${scenarioId}/immersive?mode=${narrationMode}`

  function handleBegin() {
    if (scenario!.mode === 'immersive' && !isSignedIn) {
      setShowSignInPrompt(true)
      return
    }
    navigate(scenario!.mode === 'immersive' ? immersiveUrl : `/scenario/${scenarioId}/play`)
  }

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

        {scenario.mode === 'immersive' && (
          <div className="bg-[#111111] rounded-2xl border border-white/10 p-6 mb-6">
            <h3 className="font-display font-bold text-[12px] uppercase tracking-widest text-slate-mid mb-4">
              Presentation Style
            </h3>
            <div className="flex gap-3">
              {(['voice', 'avatar'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setNarrationMode(mode)}
                  className={`flex-1 flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    narrationMode === mode
                      ? 'border-green/50 bg-green/5'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${
                    narrationMode === mode ? 'border-green bg-green' : 'border-white/30'
                  }`} />
                  <div>
                    <div className="text-[13px] font-medium text-[#f5f3ee]">
                      {mode === 'voice' ? 'Voice narration' : 'AI Avatar'}
                    </div>
                    {mode === 'avatar' && (
                      <div className="text-[11px] text-amber">Beta</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

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
            onClick={handleBegin}
            className="bg-green hover:bg-green-light text-white font-display font-semibold text-[14px] px-8 py-3 rounded-lg transition-colors tracking-wide"
          >
            {scenario.mode === 'immersive' ? 'Begin Interview' : 'Begin Simulation'}
          </button>
        </div>

        {showSignInPrompt && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#111111] border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
              <div className="w-10 h-10 rounded-full bg-green/10 border border-green/20 flex items-center justify-center mx-auto mb-5">
                <span className="text-green text-[18px]">◈</span>
              </div>
              <h2 className="font-display font-bold text-[20px] text-[#f5f3ee] mb-2">
                Ready to continue?
              </h2>
              <p className="text-[14px] text-slate-mid leading-relaxed mb-6">
                Create a free account to complete this interview and receive AI feedback on your responses.
              </p>
              <button
                onClick={() => navigate(`/sign-up?redirect_url=${encodeURIComponent(immersiveUrl)}`)}
                className="w-full bg-green hover:bg-green-light text-white font-display font-semibold text-[14px] py-3 rounded-lg transition-colors mb-3"
              >
                Create free account
              </button>
              <button
                onClick={() => navigate(`/sign-in?redirect_url=${encodeURIComponent(immersiveUrl)}`)}
                className="w-full text-[13px] text-slate-mid hover:text-[#f5f3ee] transition-colors py-1"
              >
                Already have an account? Sign in
              </button>
              <button
                onClick={() => setShowSignInPrompt(false)}
                className="w-full text-[12px] text-slate-mid/60 hover:text-slate-mid transition-colors py-1 mt-1"
              >
                Go back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
