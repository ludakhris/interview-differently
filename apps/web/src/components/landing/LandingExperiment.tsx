// DESIGN EXPERIMENT (issue #104): two landing layouts behind ?design=a|b, switched with the
// review pill (ReviewSwitch). Once the owner picks one, delete the other, the switch and the
// parameter handling, so only the chosen layout ships. See "Design experiments" in CLAUDE.md.
import { useNavigate } from 'react-router-dom'
import { Nav } from '@/components/Nav'
import { ReviewSwitch } from '@/components/ReviewSwitch'
import { HeroScene, IncidentPanel, SqlPanel, CompetencyCard } from './HeroScene'

const STATS = [
  { num: '80%', label: 'of job seekers feel unprepared', footnote: 1 },
  { num: '50%+', label: 'of hiring managers say grads are unprepared', footnote: 2 },
  { num: '400-750+', label: 'applications before landing a job', footnote: 3 },
]

const SOURCES = [
  {
    num: 1,
    label: 'Yahoo Finance / Resume.io, 2025',
    href: 'https://www.yahoo.com/news/articles/feels-challenging-break-most-recruiters-173906163.html',
  },
  {
    num: 2,
    label: 'HR Dive, 2025',
    href: 'https://www.hrdive.com/news/recent-grads-unprepared-for-workforce/747746/',
  },
  {
    num: 3,
    label: 'Lifeshack, 2025',
    href: 'https://www.lifeshack.com/resources/job-search/how-many-applications-does-it-take-to-find-a-job-in-2025/',
  },
]

const kicker = 'font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-slate-mid'
const headline =
  'font-display font-extrabold text-fg tracking-[-0.04em] leading-[1.03] [text-wrap:balance]'

function Stats({ align = 'left' }: { align?: 'left' | 'center' }) {
  return (
    <dl
      className={`grid grid-cols-1 sm:grid-cols-3 gap-6 ${align === 'center' ? 'text-center' : ''}`}
    >
      {STATS.map(({ num, label, footnote }) => (
        <div key={num}>
          <dt className="sr-only">{label}</dt>
          <dd className="font-display font-extrabold text-[36px] leading-none tracking-[-0.03em] text-primary">
            {num}
          </dd>
          <dd className="text-[14px] text-slate-light mt-2 leading-snug">
            {label}
            <sup className="text-[10px] text-slate-mid ml-0.5">{footnote}</sup>
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Sources({ align = 'left' }: { align?: 'left' | 'center' }) {
  return (
    <p
      className={`flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-slate-mid ${align === 'center' ? 'justify-center' : ''}`}
    >
      {SOURCES.map(({ num, label, href }) => (
        <a
          key={num}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-fg underline-offset-2 hover:underline transition-colors"
        >
          <sup className="mr-0.5">{num}</sup>
          {label}
        </a>
      ))}
    </p>
  )
}

function Ctas({ center = false }: { center?: boolean }) {
  const navigate = useNavigate()
  return (
    <div className={`flex flex-wrap gap-3 ${center ? 'justify-center' : ''}`}>
      <button
        onClick={() => navigate('/dashboard')}
        className="bg-primary hover:bg-accent text-on-primary font-semibold text-[15px] px-7 py-3.5 rounded-[10px] transition-colors"
      >
        Start Simulation
      </button>
      <button
        onClick={() => navigate('/request-scenario')}
        className="border border-ink text-fg hover:bg-ink/5 font-semibold text-[15px] px-7 py-3.5 rounded-[10px] transition-colors"
      >
        Request a scenario
      </button>
    </div>
  )
}

/** A: the brand hero. Headline left, the panel scene right, stats under the copy. */
function LandingA() {
  return (
    <main className="max-w-[1200px] mx-auto w-full px-4 sm:px-8 pt-12 sm:pt-16 pb-16">
      <div className="grid lg:grid-cols-[1fr_1.05fr] gap-12 lg:gap-10 items-center">
        <div className="animate-fade-in">
          <p className={`${kicker} mb-6`}>AI Powered Interview Simulations</p>
          <h1 className={`${headline} text-[clamp(44px,6.4vw,76px)] mb-6`}>
            Practice the <span className="text-primary">real</span> job before the interview.
          </h1>
          <p className="text-[19px] text-slate-light leading-relaxed max-w-[520px] mb-8">
            <strong className="font-semibold text-fg">
              Get interview ready. For real this time.
            </strong>{' '}
            Step inside real workplace decisions and let AI show you exactly how you think under
            pressure.
          </p>
          <Ctas />
        </div>
        <HeroScene className="max-w-[620px] w-full mx-auto lg:mx-0" />
      </div>

      <section aria-label="Why practice" className="mt-20 pt-10 border-t border-edge/10">
        <div className="grid lg:grid-cols-[1fr_2fr] gap-8 items-start">
          <p className="text-[17px] text-slate-light leading-relaxed">
            The job market has never been harder to break into.{' '}
            <span className="font-semibold text-fg">Interview Differently</span> gives you the reps
            — run a simulation and find out where you really stand.
          </p>
          <Stats />
        </div>
        <div className="mt-8">
          <Sources />
        </div>
      </section>
    </main>
  )
}

/** B: centred statement, then the panels laid out side by side on an ink stage, stats on paper. */
function LandingB() {
  return (
    <main className="w-full">
      <section className="max-w-[1000px] mx-auto px-4 sm:px-8 pt-14 sm:pt-20 pb-12 text-center animate-fade-in">
        <p className={`${kicker} mb-6`}>AI Powered Interview Simulations</p>
        <h1 className={`${headline} text-[clamp(44px,7vw,84px)] mb-6`}>
          Get interview ready.
          <br />
          For <span className="text-primary">real</span> this time.
        </h1>
        <p className="text-[19px] text-slate-light leading-relaxed max-w-[600px] mx-auto mb-8">
          <strong className="font-semibold text-fg">
            Practice the real job before the interview.
          </strong>{' '}
          Step inside real workplace decisions and let AI show you exactly how you think under
          pressure.
        </p>
        <Ctas center />
      </section>

      <section
        aria-label="Example simulation screens"
        className="bg-[#14213a] border-y border-[#26365a]"
      >
        <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-12 grid md:grid-cols-3 gap-5 items-start">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#9aa6bd] mb-3">
              01 · Live dashboards
            </p>
            <IncidentPanel className="ring-1 ring-[#26365a]" />
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#9aa6bd] mb-3">
              02 · Real SQL
            </p>
            <SqlPanel className="ring-1 ring-[#26365a]" />
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#9aa6bd] mb-3">
              03 · Scored feedback
            </p>
            <CompetencyCard />
          </div>
        </div>
      </section>

      <section className="max-w-[1000px] mx-auto px-4 sm:px-8 py-14 text-center">
        <p className="text-[17px] text-slate-light leading-relaxed max-w-[560px] mx-auto mb-10">
          The job market has never been harder to break into.{' '}
          <span className="font-semibold text-fg">Interview Differently</span> gives you the reps —
          run a simulation and find out where you really stand.
        </p>
        <Stats align="center" />
        <div className="mt-8">
          <Sources align="center" />
        </div>
      </section>
    </main>
  )
}

export function LandingExperiment() {
  const design = new URLSearchParams(window.location.search).get('design') === 'b' ? 'b' : 'a'
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <Nav />
      {design === 'b' ? <LandingB /> : <LandingA />}
      <ReviewSwitch
        param="design"
        label="Landing layout"
        current={design}
        options={[
          { key: 'a', label: 'A · Split hero' },
          { key: 'b', label: 'B · Centred + stage' },
        ]}
      />
    </div>
  )
}
