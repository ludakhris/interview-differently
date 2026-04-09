import { useNavigate } from 'react-router-dom'

interface PreviewGateProps {
  scenarioId: string
}

export function PreviewGate({ scenarioId }: PreviewGateProps) {
  const navigate = useNavigate()
  const redirectUrl = encodeURIComponent(`/scenario/${scenarioId}/briefing`)

  return (
    <div className="absolute inset-0 flex items-center justify-center z-10">
      {/* Fade — starts transparent, darkens only near the card */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-40% via-[#0a0a0a]/40 via-60% to-[#0a0a0a]/80" />

      {/* Sign-up card */}
      <div className="relative z-10 bg-[#111111] border border-white/10 rounded-2xl p-8 max-w-sm w-full mx-6 text-center shadow-2xl">
        <div className="w-10 h-10 rounded-full bg-green/10 border border-green/20 flex items-center justify-center mx-auto mb-5">
          <span className="text-green text-[18px]">◈</span>
        </div>

        <h2 className="font-display font-bold text-[20px] text-[#f5f3ee] mb-2">
          Ready to continue?
        </h2>
        <p className="text-[14px] text-slate-mid leading-relaxed mb-6">
          Create a free account to finish this simulation and see how your decisions score.
        </p>

        <button
          onClick={() => navigate(`/sign-up?redirect_url=${redirectUrl}`)}
          className="w-full bg-green hover:bg-green-light text-white font-display font-semibold text-[14px] py-3 rounded-lg transition-colors mb-3"
        >
          Create free account
        </button>
        <button
          onClick={() => navigate(`/sign-in?redirect_url=${redirectUrl}`)}
          className="w-full text-[13px] text-slate-mid hover:text-[#f5f3ee] transition-colors py-1"
        >
          Already have an account? Sign in
        </button>
      </div>
    </div>
  )
}
