import { useNavigate } from 'react-router-dom'
import { Nav } from '@/components/Nav'
import { IncidentPanel, InterviewPanel, SqlPanel } from './ScenePanels'

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
    <div
      className={`grid grid-cols-1 sm:grid-cols-3 gap-6 ${align === 'center' ? 'text-center' : ''}`}
    >
      {STATS.map(({ num, label, footnote }) => (
        <p key={num}>
          <span className="block font-display font-extrabold text-[36px] leading-none tracking-[-0.03em] text-primary">
            {num}
          </span>{' '}
          <span className="block text-[14px] text-slate-light mt-2 leading-snug">
            {label}
            <sup className="text-[10px] text-slate-mid ml-0.5">{footnote}</sup>
          </span>
        </p>
      ))}
    </div>
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

const SCENARIOS = [
  {
    kicker: 'Incident response',
    title: 'Triage a live outage',
    body: 'Monitors are firing and the SLA clock is running. Decide what to fix first and who to tell.',
    panel: <IncidentPanel />,
    label:
      'Example incident chart: payment API error rate climbing to 14.2% after the incident start, database connections at 94%, auth latency up 340 ms.',
  },
  {
    kicker: 'Data analytics',
    title: 'Answer with real SQL',
    body: 'A colleague needs numbers today. Write the query against a real dataset and defend the result.',
    panel: <SqlPanel />,
    label:
      'Example data analytics question: the AI interviewer asks which customers the outage hit, answered with a SQL query.',
  },
]

const card =
  'bg-surface-alt rounded-[20px] border border-edge/10 p-5 sm:p-6 shadow-[0_24px_48px_-28px_rgba(20,33,58,0.35)]'
const cardTitle = 'font-display font-bold text-[22px] text-fg tracking-[-0.02em] mt-1'

const COMPETENCIES = [
  ['Prioritization', 88],
  ['Stakeholder communication', 72],
  ['Root cause reasoning', 58],
] as const

/** The featured scenario: a live interview with an AI interviewer on video. */
function InterviewFeature() {
  return (
    <article
      className={`${card} grid grid-cols-1 lg:grid-cols-[1fr_1.25fr] gap-6 lg:gap-10 items-center`}
    >
      <div>
        <p className={`${kicker} flex items-center gap-2`}>
          <span className="w-2 h-2 rounded-full bg-primary" aria-hidden="true" />
          Live AI interview
        </p>
        <h3 className={`${cardTitle} text-[clamp(24px,3vw,32px)]`}>
          Sit the interview before the interview.
        </h3>
        <p className="text-[16px] text-slate-light leading-relaxed mt-3">
          An AI interviewer talks you through a real scenario on video. You answer out loud, it
          follows up on what you actually said, and you hear yourself under pressure before it
          counts.
        </p>
      </div>
      <div
        role="img"
        aria-label="Example live AI interview: the interviewer on video asks how you would handle the first five minutes of a payments outage, while your answer is recorded."
      >
        <InterviewPanel />
      </div>
    </article>
  )
}

/** How every scenario is scored. Not a scenario of its own, so it reads as a different block. */
function Evaluation() {
  return (
    <section
      aria-labelledby="evaluation-heading"
      className="mt-6 rounded-[20px] bg-ink text-surface p-6 sm:p-8 grid lg:grid-cols-[1fr_1.1fr] gap-8 items-center"
    >
      <div>
        <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-surface/70">
          How you are evaluated
        </p>
        <h3
          id="evaluation-heading"
          className="font-display font-bold text-[clamp(24px,3vw,32px)] tracking-[-0.02em] mt-1"
        >
          Every answer is scored, in every scenario.
        </h3>
        <p className="text-[16px] text-surface/80 leading-relaxed mt-3">
          An AI evaluator reads each decision against the rubric for the role, the same competencies
          hiring managers look for. You get a score, the reasoning behind it and what to do
          differently, then a competency profile at the end.
        </p>
      </div>
      <div className="rounded-[16px] bg-surface-alt text-fg p-5">
        <div className="flex flex-col gap-3">
          {COMPETENCIES.map(([label, pct]) => (
            <div key={label} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5">
              <span className="font-semibold text-[14px]">{label}</span>
              <span className="font-mono text-[13px] text-slate-mid">{pct}</span>
              <span className="col-span-2 h-2 rounded-full bg-ink/10 overflow-hidden">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 pt-4 border-t border-edge/10 text-[14px] leading-relaxed text-slate-light">
          <span className="font-semibold text-fg">Feedback:</span> You found the database spike
          first, which was right. Next time, post a status update before you dig in, so support
          isn&apos;t guessing.
        </p>
      </div>
    </section>
  )
}

/** The scenarios: the live interview featured, two more beside each other, then how scoring works. */
function Scenarios() {
  return (
    <section
      aria-labelledby="scenarios-heading"
      className="bg-primary-pale border-y border-edge/10"
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-14">
        <h2 id="scenarios-heading" className={`${kicker} text-center mb-8`}>
          Inside a simulation
        </h2>
        <InterviewFeature />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {SCENARIOS.map((s) => (
            <article key={s.kicker} className={`${card} flex flex-col`}>
              <p className={kicker}>{s.kicker}</p>
              <h3 className={cardTitle}>{s.title}</h3>
              <p className="text-[15px] text-slate-light leading-relaxed mt-1 mb-5">{s.body}</p>
              <div role="img" aria-label={s.label} className="flex-1 flex flex-col [&>*]:flex-1">
                {s.panel}
              </div>
            </article>
          ))}
        </div>
        <Evaluation />
      </div>
    </section>
  )
}

/** The landing page: centred statement, the stats, then the scenarios and how they are scored. */
export function Landing() {
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
          Step inside real workplace decisions, get scored on every answer, and see exactly how you
          think under pressure.
        </p>
        <Ctas center />
      </section>

      <section
        aria-label="Why practice"
        className="max-w-[1000px] mx-auto px-4 sm:px-8 pb-14 text-center"
      >
        <p className="text-[17px] text-slate-light leading-relaxed max-w-[560px] mx-auto mb-8">
          The job market has never been harder to break into.{' '}
          <span className="font-semibold text-fg">Interview Differently</span> gives you the reps —
          run a simulation and find out where you really stand.
        </p>
        <Stats align="center" />
        <div className="mt-6">
          <Sources align="center" />
        </div>
      </section>

      <Scenarios />
    </main>
  )
}

export function LandingShell() {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <Nav />
      <Landing />
    </div>
  )
}
