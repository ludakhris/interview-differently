import { useNavigate } from 'react-router-dom'

export function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <nav className="flex items-center justify-between px-8 py-5">
        <span className="font-display font-extrabold text-[17px] text-[#f5f3ee] tracking-tight">
          Interview<span className="text-green-light">Differently</span>
        </span>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-[13px] font-medium text-slate-light hover:text-white transition-colors"
        >
          Sign in
        </button>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(26,107,60,0.18) 0%, transparent 70%)',
          }}
        />

        <div className="relative z-10 max-w-3xl mx-auto animate-fade-in">
          <span className="inline-block text-[11px] font-medium tracking-[2px] uppercase text-green-light border border-green/30 px-4 py-1.5 rounded-full mb-8">
            AI Career Simulation Platform
          </span>

          <h1 className="font-display font-extrabold text-[clamp(44px,7vw,84px)] text-[#f5f3ee] leading-[1.0] tracking-[-2px] mb-7">
            Practice the job<br />
            <em className="not-italic text-green-light">before you get it.</em>
          </h1>

          <p className="text-[18px] text-slate-light font-light leading-relaxed max-w-[480px] mx-auto mb-12">
            Branching simulations that put you inside real workplace decisions. AI evaluates how you think, not just what you answer.
          </p>

          <div className="flex items-center justify-center gap-6 mb-16 flex-wrap">
            {[
              { num: '75%', label: 'of grads feel unprepared', red: true },
              { num: '450:1', label: 'students per career coach', red: true },
              { num: '3 tracks', label: 'launching in pilot', red: false },
            ].map(({ num, label, red }) => (
              <div key={num} className="text-center">
                <span className={`font-display font-extrabold text-[36px] block leading-none ${red ? 'text-red-400' : 'text-[#f5f3ee]'}`}>
                  {num}
                </span>
                <span className="text-[12px] text-slate-light font-light mt-1 block">{label}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-4 justify-center flex-wrap">
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-green hover:bg-green-light text-white font-display font-semibold text-[14px] px-8 py-3.5 rounded-lg transition-all hover:-translate-y-px tracking-wide"
            >
              Start Simulation
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="border border-white/20 hover:border-white/50 text-[#f5f3ee] font-display font-semibold text-[14px] px-8 py-3.5 rounded-lg transition-colors"
            >
              View Demo
            </button>
          </div>
        </div>
      </main>

      <footer className="text-center py-6 text-[12px] text-slate-mid">
        interviewdifferently.com — Pilot cohort open April 2026
      </footer>
    </div>
  )
}
