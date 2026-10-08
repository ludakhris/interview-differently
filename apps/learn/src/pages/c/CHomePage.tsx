import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { CONTACT_EMAIL } from '../../contact'
import { AccountMenu } from '../../auth'
import { ProductsMenu } from '../../components/ProductsMenu'
import { productPagePath, PRODUCTS } from '../../products'
import { PATHWAYS } from '../homeContent'
import {
  ANCHORS,
  COMPONENTS,
  LOOP,
  MEASURES,
  MEASURES_MORE,
  PACE,
  PERSONAS,
  PROVENANCE,
  TRADITIONAL,
  WALKTHROUGH,
  type ManualIcon,
} from './cContent'
import '../home.css'
import './c-home.css'

// Walkthrough requests open the visitor's mail app; there is no backend form yet.
function bookWalkthrough(e: FormEvent<HTMLFormElement>) {
  e.preventDefault()
  const email = new FormData(e.currentTarget).get('email')?.toString() ?? ''
  const subject = encodeURIComponent('Learn Differently walkthrough')
  const body = encodeURIComponent(`Please contact me to book a walkthrough: ${email}`)
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="m5 12.5 4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Design A's hero cards, as they are on Design A. */
function HeroCards() {
  return (
    <div className="ld-hero-cards">
      <svg className="ld-hero-loop" viewBox="0 0 520 560" aria-hidden="true">
        <ellipse
          cx="260"
          cy="280"
          rx="215"
          ry="235"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="6 10"
          transform="rotate(-12 260 280)"
        />
      </svg>
      <div className="ld-card ld-card-lesson">
        <span className="ld-mono ld-faint">MICROLEARNING · 3 MIN</span>
        <span className="ld-card-title">Triage an alert</span>
        <span className="ld-progress" aria-hidden="true">
          <span style={{ width: '72%' }} />
        </span>
        <span className="ld-small ld-faint">Ends in a real-world exercise →</span>
      </div>
      <div className="ld-card ld-card-sim">
        <div className="ld-row-between">
          <span className="ld-mono ld-steel">SIMULATION · ON CALL</span>
          <span className="ld-mono ld-pill">WITH AN AI AGENT</span>
        </div>
        <div className="ld-chat">
          <div className="ld-chat-msg">
            <span className="ld-chat-who">AI ops agent</span>
            <span>Checkout latency is spiking. Roll back release 4.2?</span>
          </div>
          <div className="ld-chat-msg ld-chat-you">
            <span className="ld-chat-who">You</span>
            <span>
              Checking deployment pipeline, initiating rollback, notifying on-call manager.
            </span>
          </div>
        </div>
        <span className="ld-small ld-steel ld-card-foot">Scored on judgment, not recall</span>
      </div>
      <div className="ld-card ld-card-skill">
        <span className="ld-skill-check" aria-hidden="true">
          <CheckIcon />
        </span>
        <div>
          <span className="ld-mono ld-faint">VERIFIED SKILL</span>
          <span className="ld-card-title">Incident triage</span>
        </div>
      </div>
      <div className="ld-card ld-card-match">
        <span className="ld-mono">TALENT MATCH</span>
        <span className="ld-card-title">Junior SRE</span>
        <span className="ld-match-strength">
          <span className="ld-match-dot" aria-hidden="true" />
          Strong match · 4 of 4 skills shown
        </span>
      </div>
      <p className="ld-small ld-faint ld-hero-note">Sample records for illustration.</p>
    </div>
  )
}

/**
 * Two learners from one start to one endpoint. Maya's route runs clean; Theo's dips and takes
 * two detours where a gap added a lesson. Both rejoin at "day-1 job ready".
 */
function ForkTracks() {
  const maya = 'M 70 150 C 190 150, 210 78, 320 78 L 700 78 C 810 78, 850 150, 930 150'
  const theo =
    'M 70 150 C 190 150, 210 222, 300 222 L 420 222 ' +
    'C 440 222, 445 262, 480 262 C 515 262, 520 222, 540 222 ' +
    'L 600 222 C 620 222, 625 262, 660 262 C 695 262, 700 222, 720 222 ' +
    'L 790 222 C 860 222, 880 150, 930 150'
  const mayaNodes: [number, string][] = [
    [320, 'Caller verification'],
    [510, 'Ticket triage'],
    [700, 'Phishing response'],
  ]
  const theoNodes: [number, string][] = [
    [300, 'Password resets'],
    [420, 'Caller verification'],
    [600, 'Ticket triage'],
    [790, 'Phishing response'],
  ]
  const detours: [number, string][] = [
    [480, 'Gap found · DNS basics added'],
    [660, 'Gap found · Escalation added'],
  ]
  return (
    <div className="c-fork">
      <p className="c-fork-hint">Swipe to follow both routes →</p>
      <div className="c-fork-scroll">
        <svg
          className="c-fork-svg"
          viewBox="0 0 1000 320"
          role="img"
          aria-label="Maya and Theo start from the same skills assessment, take different routes, and reach the same day-one job-ready endpoint"
        >
          <defs>
            <marker
              id="c-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0 0 10 5 0 10z" fill="currentColor" />
            </marker>
          </defs>

          <path d={maya} className="c-fork-path c-fork-maya" pathLength={1} />
          <path d={theo} className="c-fork-path c-fork-theo" pathLength={1} />

          <g className="c-fork-start" transform="translate(70 150)">
            <circle r="16" />
            <text y="-30" textAnchor="middle" className="c-fork-label">
              DAY 1
            </text>
            <text y="46" textAnchor="middle" className="c-fork-label">
              SKILLS ASSESSMENT
            </text>
            <text y="62" textAnchor="middle" className="c-fork-sub">
              a simulation of the job
            </text>
          </g>

          {mayaNodes.map(([x, label]) => (
            <g
              key={label}
              className="c-fork-node c-fork-node-maya"
              transform={`translate(${x} 78)`}
            >
              <circle r="9" />
              <text y="-18" textAnchor="middle">
                {label}
              </text>
            </g>
          ))}
          <text x="200" y="118" className="c-fork-who c-fork-who-maya">
            Maya · assessment 80%
          </text>
          <text x="790" y="116" className="c-fork-week c-fork-who-maya">
            week 6
          </text>

          {theoNodes.map(([x, label]) => (
            <g
              key={label}
              className="c-fork-node c-fork-node-theo"
              transform={`translate(${x} 222)`}
            >
              <circle r="9" />
              <text y="-18" textAnchor="middle">
                {label}
              </text>
            </g>
          ))}
          {detours.map(([x, label]) => (
            <g key={label} className="c-fork-detour" transform={`translate(${x} 262)`}>
              <circle r="9" />
              <text y="8" textAnchor="middle" className="c-fork-plus">
                +
              </text>
              <text y="30" textAnchor="middle">
                {label}
              </text>
            </g>
          ))}
          <text x="200" y="300" className="c-fork-who c-fork-who-theo">
            Theo · assessment 34%
          </text>
          <text x="830" y="252" className="c-fork-week c-fork-who-theo">
            week 10
          </text>

          <g className="c-fork-end" transform="translate(930 150)">
            <circle r="22" />
            <path
              d="m-8 1 5 5 11-11"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <text y="-36" textAnchor="middle" className="c-fork-label">
              DAY-1 JOB READY
            </text>
            <text y="50" textAnchor="middle" className="c-fork-sub">
              credential earned
            </text>
            <text y="66" textAnchor="middle" className="c-fork-sub">
              skill gains documented
            </text>
          </g>
        </svg>
      </div>
      <ul className="c-fork-legend">
        {PACE.map((p) => (
          <li key={p.name} className={`c-fork-legend-${p.name.toLowerCase()}`}>
            <strong>
              {p.name} · {p.score} on the assessment · week {p.weeks}
            </strong>
            <span>{p.note}</span>
          </li>
        ))}
        <li className="ld-faint">
          Illustrative learners. The route is how the product is built to work.
        </li>
      </ul>
    </div>
  )
}

/** The manual artifact each component replaces, as a small line drawing. */
function ManualGlyph({ icon }: { icon: ManualIcon }) {
  const p = {
    width: 36,
    height: 36,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (icon === 'sheet')
    return (
      <svg {...p}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M3 14h18M9 4v16M15 4v16" />
      </svg>
    )
  if (icon === 'video')
    return (
      <svg {...p}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
      </svg>
    )
  if (icon === 'quiz')
    return (
      <svg {...p}>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
        <path d="m6.5 7.5.8.8 1.4-1.6" strokeWidth="1.2" />
      </svg>
    )
  if (icon === 'list')
    return (
      <svg {...p}>
        <path d="M4 6h12M4 12h12M4 18h12" />
        <circle cx="19" cy="12" r="2.2" />
        <path d="m20.6 13.6 2 2" />
      </svg>
    )
  return (
    <svg {...p}>
      <path d="M6 8h9l3 3v9H6z" />
      <path d="M8 5h9l3 3v9" />
      <path d="M9 13h6M9 16h6" />
    </svg>
  )
}

/** The persona switch: what your team stops doing, from each seat. */
function ForYourTeam() {
  const [key, setKey] = useState(PERSONAS[0].key)
  const p = PERSONAS.find((x) => x.key === key) ?? PERSONAS[0]
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = PERSONAS.length - 1
    const to =
      e.key === 'ArrowRight'
        ? (i + 1) % PERSONAS.length
        : e.key === 'ArrowLeft'
          ? (i + last) % PERSONAS.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1
    if (to < 0) return
    e.preventDefault()
    setKey(PERSONAS[to].key)
    document.getElementById(`c-team-${PERSONAS[to].key}`)?.focus()
  }
  return (
    <div className="c-team">
      <div className="c-seg" role="tablist" aria-label="Who are you">
        {PERSONAS.map((x, i) => (
          <button
            key={x.key}
            id={`c-team-${x.key}`}
            type="button"
            role="tab"
            aria-selected={x.key === p.key}
            aria-controls="c-team-panel"
            tabIndex={x.key === p.key ? 0 : -1}
            className={x.key === p.key ? 'c-seg-btn c-seg-on' : 'c-seg-btn'}
            onClick={() => setKey(x.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {x.tab}
          </button>
        ))}
      </div>
      <div
        id="c-team-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`c-team-${p.key}`}
        className="c-team-panel"
      >
        <div className="c-team-copy">
          <h3 className="ld-h2 ld-h2-sm">{p.headline}</h3>
          <p className="ld-sub">{p.lead}</p>
          <ul className="c-points">
            {p.points.map((pt) => (
              <li key={pt}>{pt}</li>
            ))}
          </ul>
          <a href={p.key === 'learner' ? '/sign-in' : '#demo'} className="ld-btn ld-btn-ink">
            {p.cta}
          </a>
        </div>
        <div className="c-stops">
          <span className="ld-mono ld-steel">WHAT YOUR TEAM STOPS DOING</span>
          <strong>{p.stops}</strong>
        </div>
      </div>
    </div>
  )
}

export function CHomePage() {
  return (
    <div className="ld c">
      <header className="ld-wrap ld-header">
        <a href="/" className="ld-brand">
          <span className="ld-mark" aria-hidden="true" />
          <span className="ld-wordmark">
            learn<span className="ld-slash">/</span>differently
          </span>
        </a>
        <nav aria-label="Main">
          <ul className="ld-nav">
            <li>
              <ProductsMenu hrefFor={(p) => ({ href: productPagePath(p) })} />
            </li>
            <li>
              <a href="#path">How it works</a>
            </li>
            <li>
              <a href="#team">For your team</a>
            </li>
            <li>
              <a href="#outcomes">Outcomes</a>
            </li>
            <li>
              <a href="#pathways">Career pathways</a>
            </li>
          </ul>
        </nav>
        <div className="ld-header-actions">
          <AccountMenu
            signedOut={
              <>
                <a href="/sign-in" className="ld-signin-link">
                  Sign in
                </a>
                <a href="#demo" className="ld-btn ld-btn-ink">
                  Book a walkthrough
                </a>
              </>
            }
          />
        </div>
      </header>

      <main>
        <section id="top" className="ld-wrap ld-hero">
          <div className="ld-hero-copy">
            <p className="ld-mono ld-eyebrow">
              TRAINING AND WORKFORCE DEVELOPMENT FOR THE AGENTIC ERA
            </p>
            <h1 className="ld-hero-title c-hero-title">
              Training that behaves like <span className="ld-orange">the job.</span>
            </h1>
            <p className="ld-lead">
              Every learner takes a different path. Same outcome. One application with five
              components that replaces the spreadsheets, disconnected systems and repeated reporting
              your team juggles today.
            </p>
            <div className="ld-hero-actions">
              <a href="#demo" className="ld-btn ld-btn-orange ld-btn-lg">
                Book a walkthrough
              </a>
              <a href="#path" className="ld-btn ld-btn-outline ld-btn-lg">
                Follow one learner ↓
              </a>
            </div>
            <p className="ld-hero-learner">
              Sent here by your program? <a href="/sign-in">Sign in</a> with the account they gave
              you.
            </p>
          </div>
          <HeroCards />
        </section>

        <div className="ld-wrap">
          <ul className="c-anchors" aria-label="What you get">
            {ANCHORS.map((a) => (
              <li key={a.k}>
                <span className="ld-mono ld-eyebrow">{a.k}</span>
                <span>{a.v}</span>
              </li>
            ))}
          </ul>
        </div>

        <section id="path" className="ld-wrap ld-section">
          <div className="ld-section-head ld-ruled">
            <div>
              <p className="ld-mono ld-eyebrow">HOW IT WORKS</p>
              <h2 className="ld-h2">
                Every learner takes a different path.{' '}
                <span className="ld-orange">Same job-ready outcome.</span>
              </h2>
            </div>
            <p className="ld-sub">
              A skills assessment modeled on the job places each learner on day one. From there, a
              short lesson, a real exercise, a score, and the next lesson chosen by the gap. Strong
              learners move on; others take the detours. Everyone reaches the same bar, and your
              team sees where each person is without asking.
            </p>
          </div>
          <ForkTracks />
          <div className="c-loop-wrap">
            <ol className="c-loop">
              {LOOP.map((s, i) => (
                <li key={s.key} className={`c-loop-step c-loop-${s.key}`}>
                  <span className="c-loop-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3 className="ld-h3">{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
            <div className="c-loop-return" aria-hidden="true">
              <span className="c-loop-return-label">
                <strong>+1 verified skill every pass.</strong> A miss adds the next lesson, not a
                retake, and the loop goes around again.
              </span>
            </div>
          </div>
          <div className="c-trad">
            <p className="ld-mono ld-faint">TRADITIONAL TRAINING MODELS · WHAT CHANGES</p>
            <ul className="c-trad-list">
              {TRADITIONAL.map((t) => (
                <li key={t.from}>
                  <span className="c-trad-from">{t.from}</span>
                  <span className="c-trad-arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="c-trad-to">{t.to}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="team" className="ld-dark ld-rounded-top">
          <div className="ld-wrap ld-section c-team-section">
            <div className="ld-section-head">
              <div>
                <p className="ld-mono ld-eyebrow-sky">FOR YOUR TEAM</p>
                <h2 className="ld-h2">Learners job-ready faster. Your team’s hours back.</h2>
              </div>
              <p className="ld-sub">
                Skills that match what employers are hiring for, documented as they are gained. And
                the attendance sheet, the gradebook, the placement spreadsheet and the quarterly
                report stop being four separate jobs.
              </p>
            </div>
            <ForYourTeam />
          </div>
        </section>

        <section id="components" className="ld-paper ld-rounded-top ld-overlap">
          <div className="ld-wrap ld-section">
            <div className="ld-section-head">
              <div>
                <p className="ld-mono ld-eyebrow">
                  ONE SEAMLESS APPLICATION · FIVE COMPONENTS · ONE RECORD
                </p>
                <h2 className="ld-h2 ld-h2-sm">
                  What your team does by hand today, in separate places, then aggregates for the
                  report.
                </h2>
              </div>
              <p className="ld-sub">
                One sign-in, one learner record. Each component takes over a file or a tool the team
                keeps today, and writes to the record the report is built from. Nothing is entered
                twice.
              </p>
            </div>
            <ul className="c-components">
              {COMPONENTS.map((c, i) => (
                <li key={c.name} className="c-component">
                  <span className="c-component-glyph">
                    <ManualGlyph icon={c.icon} />
                  </span>
                  <span className="ld-mono ld-faint">BY HAND TODAY</span>
                  <span className="c-component-manual">{c.manual}</span>
                  <span className="c-component-arrow" aria-hidden="true">
                    ↓
                  </span>
                  <a href={productPagePath(PRODUCTS[i])} className="c-component-name">
                    {c.name}
                  </a>
                  <span className="c-component-now">{c.now}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="outcomes" className="ld-wrap ld-section">
          <div className="ld-section-head ld-ruled">
            <div>
              <p className="ld-mono ld-eyebrow">OUTCOMES ALREADY TRACKED</p>
              <h2 className="ld-h2">Report once, in the terms your funders use.</h2>
            </div>
            <p className="ld-sub">
              The three measures programs are held to are defined once and tracked as learners work,
              so the quarterly report is an export, not a project. {PROVENANCE}
            </p>
          </div>
          <div className="c-measures">
            {MEASURES.map((m) => (
              <article key={m.abbr} className="c-measure">
                <span className="ld-mono ld-eyebrow">{m.abbr}</span>
                <h3 className="ld-h3 ld-h3-lg">{m.name}</h3>
                <p className="c-measure-def">{m.def}</p>
                <p className="c-measure-how">
                  <span className="ld-mono ld-faint">HOW IT’S TRACKED </span>
                  {m.how}
                </p>
              </article>
            ))}
          </div>
          <p className="ld-mono ld-faint c-measures-more-label">TWO MORE YOUR GRANT WILL ASK FOR</p>
          <div className="c-measures c-measures-more">
            {MEASURES_MORE.map((m) => (
              <article key={m.abbr} className="c-measure">
                <div className="ld-row-between">
                  <span className="ld-mono ld-eyebrow">{m.abbr}</span>
                  {m.soon && <span className="ld-piece-status">{m.soon}</span>}
                </div>
                <h3 className="ld-h3 ld-h3-lg">{m.name}</h3>
                <p className="c-measure-def">{m.def}</p>
                <p className="c-measure-how">
                  <span className="ld-mono ld-faint">HOW IT’S TRACKED </span>
                  {m.how}
                </p>
              </article>
            ))}
          </div>
          <figure className="ld-state-shot c-shot">
            <img
              src="/site/agency-dashboard.jpg"
              width="1280"
              height="860"
              loading="lazy"
              alt="A state workforce board's outcomes dashboard: participants enrolled, completion rate, learners who reached the target score and interview-ready count, then assessment scores before and after training for each provider"
            />
            <figcaption className="ld-small ld-faint">
              What a state sees across the providers it funds: the same measures, side by side.
              Fictional providers and sample data.
            </figcaption>
          </figure>
        </section>

        <section id="pathways" className="ld-wrap ld-section">
          <div className="ld-section-head ld-ruled">
            <div>
              <p className="ld-mono ld-eyebrow">CAREER PATHWAYS</p>
              <h2 className="ld-h2 ld-h2-sm">
                Pathways built around the jobs employers are hiring for.
              </h2>
            </div>
            <p className="ld-sub">
              Each pathway pairs short lessons with a simulation of the judgment the job now needs.
              Bring your own curriculum and we build the simulation with your subject-matter
              experts.
            </p>
          </div>
          <ul className="c-pathways">
            {PATHWAYS.map((p) => (
              <li key={p.id} className="c-pathway">
                <span className="ld-mono ld-faint">{p.sector.toUpperCase()}</span>
                <strong>{p.title}</strong>
                <span className="c-pathway-sim">Simulation: {p.simulationTitle.toLowerCase()}</span>
                <span className="c-pathway-roles">{p.roles.join(' · ')}</span>
              </li>
            ))}
          </ul>
          <p className="ld-small ld-faint">
            Example pathways. Scenarios, skills and roles are illustrative.
          </p>
        </section>

        <section id="demo" className="ld-cta ld-rounded-top">
          <div className="ld-wrap ld-cta-inner">
            <h2 className="ld-cta-title">See a cohort run end to end.</h2>
            <ol className="ld-pilot">
              {WALKTHROUGH.map((s, i) => (
                <li key={s.t}>
                  <span className="ld-pilot-n">{i + 1}</span>
                  <span className="ld-pilot-title">{s.t}</span>
                  <span className="ld-pilot-body">{s.b}</span>
                </li>
              ))}
            </ol>
            <div className="ld-cta-row">
              <p className="ld-cta-sub">
                Thirty minutes. Bring your reporting template and we fill it from the cohort you
                brought.
              </p>
              <form className="ld-cta-form" onSubmit={bookWalkthrough}>
                <label htmlFor="c-email" className="ld-visually-hidden">
                  Work email
                </label>
                <input id="c-email" name="email" type="email" required placeholder="Work email" />
                <button type="submit">Book a walkthrough</button>
              </form>
            </div>
            <footer className="ld-footer">
              <div className="ld-footer-brand">
                <span className="ld-footer-name">learn/differently</span>
                <span>Training that behaves like the job.</span>
                <span className="ld-mono">learndifferently.tech</span>
              </div>
              <nav aria-label="Footer" className="ld-footer-links">
                <a href="#components">Products</a>
                <a href="/release-notes/">Release notes</a>
                <a href="/privacy">Privacy</a>
                <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
              </nav>
            </footer>
          </div>
        </section>
      </main>
    </div>
  )
}
