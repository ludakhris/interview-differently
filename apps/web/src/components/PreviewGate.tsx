import { useNavigate } from 'react-router-dom'

interface PreviewGateProps {
  scenarioId: string
}

export function PreviewGate({ scenarioId }: PreviewGateProps) {
  const navigate = useNavigate()
  const redirectUrl = encodeURIComponent(`/scenario/${scenarioId}/briefing`)

  return (
    <div className="absolute inset-0 flex items-center justify-center z-10">
      {/* Fade — starts transparent, dims to paper near the card */}
      <div className="absolute inset-0 bg-linear-to-b from-transparent from-40% via-surface/70 via-60% to-surface/95" />

      {/* Sign-up card */}
      <div className="relative z-10 bg-surface-alt border border-edge/10 rounded-2xl p-8 max-w-sm w-full mx-6 text-center shadow-card-lg">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5">
          <span className="text-primary text-[18px]">◈</span>
        </div>

        <h2 className="font-display font-bold text-[20px] text-fg mb-2">Ready to continue?</h2>
        <p className="text-[14px] text-slate-mid leading-relaxed mb-6">
          Create a free account to finish this simulation and see how your decisions score.
        </p>

        <button
          onClick={() => navigate(`/sign-up?redirect_url=${redirectUrl}`)}
          className="w-full bg-primary hover:bg-accent text-on-primary font-display font-semibold text-[14px] py-3 rounded-lg transition-colors mb-3"
        >
          Create free account
        </button>
        <button
          onClick={() => navigate(`/sign-in?redirect_url=${redirectUrl}`)}
          className="w-full text-[13px] text-slate-mid hover:text-fg transition-colors py-1"
        >
          Already have an account? Sign in
        </button>
      </div>
    </div>
  )
}
