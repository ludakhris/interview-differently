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
            AI Powered Interview Simulations
          </span>

          <h1 className="font-display font-extrabold text-[clamp(44px,7vw,84px)] text-[#f5f3ee] leading-[1.0] tracking-[-2px] mb-7">
            Get interview ready.<br />
            <em className="not-italic text-green-light">For real this time.</em>
          </h1>

          <p className="text-[18px] text-slate-light font-light leading-relaxed max-w-[480px] mx-auto mb-12">
            Simulations built to get you interview ready. Step inside real workplace decisions and let AI show you exactly how you think under pressure.
          </p>

          <div className="flex items-center justify-center gap-6 mb-10 flex-wrap">
            {[
              { num: '80%', label: 'of job seekers feel unprepared', footnote: 1 },
              { num: '50%+', label: 'of hiring managers say grads are unprepared', footnote: 2 },
              { num: '400–750+', label: 'applications before landing a job', footnote: 3 },
            ].map(({ num, label, footnote }) => (
              <div key={num} className="text-center">
                <span className="font-display font-extrabold text-[36px] block leading-none text-red-400">
                  {num}
                </span>
                <span className="text-[12px] text-slate-light font-light mt-1 block">
                  {label}<sup className="text-[9px] text-slate-mid ml-0.5">{footnote}</sup>
                </span>
              </div>
            ))}
          </div>

          <p className="text-[15px] text-slate-light font-light max-w-[420px] mx-auto mb-12 leading-relaxed">
            The job market has never been harder to break into.{' '}
            <span className="text-[#f5f3ee] font-medium">Interview<span className="text-green-light">Differently</span></span>{' '}
            gives you the reps — run a simulation and find out where you really stand.
          </p>

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

      <footer className="text-center py-6 text-[12px] text-slate-mid space-y-2">
        <div className="flex items-center justify-center gap-4 flex-wrap">
          {[
            { num: 1, label: 'Yahoo Finance / Resume.io, 2025', href: 'https://www.yahoo.com/news/articles/feels-challenging-break-most-recruiters-173906163.html' },
            { num: 2, label: 'HR Dive, 2025', href: 'https://www.hrdive.com/news/recent-grads-unprepared-for-workforce/747746/' },
            { num: 3, label: 'Lifeshack, 2025', href: 'https://www.lifeshack.com/resources/job-search/how-many-applications-does-it-take-to-find-a-job-in-2025/' },
          ].map(({ num, label, href }) => (
            <a key={num} href={href} target="_blank" rel="noopener noreferrer"
              className="hover:text-slate-light transition-colors">
              <sup className="mr-0.5">{num}</sup>{label}
            </a>
          ))}
        </div>
        <p>© 2026 InterviewDifferently™. All rights reserved.</p>
      </footer>
    </div>
  )
}
