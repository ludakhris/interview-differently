import type { FormEvent } from 'react'
import { CONTACT_EMAIL } from '../contact'
import { SiteAccountMenu } from '../components/SiteAccountMenu'
import { ProductsMenu } from '../components/ProductsMenu'
import { productPagePath, PRODUCTS } from '../products'
import { PATHWAYS } from './homeContent'
import { PaceTracks } from './home/PaceTracks'
import { FloatingCta } from './home/FloatingCta'
import { TourVideo } from './home/TourVideo'
import {
  COMPONENTS,
  LOOP,
  MEASURES,
  MEASURES_MORE,
  PROVENANCE,
  TRADITIONAL,
  WALKTHROUGH,
  type ManualIcon,
} from './home/content'
import './home.css'
import './home/home-sections.css'

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

/** Design A's loop: micro-learning, then practice, then prove, then back around on the gap. */
function LoopDiagram() {
  return (
    <svg
      className="ld-loop-svg"
      viewBox="0 0 420 420"
      role="img"
      aria-label="The loop: micro-learning, then practice, then prove, then back to micro-learning on the gap"
    >
      <defs>
        <marker
          id="c-loop-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 10 5 0 10z" fill="currentColor" />
        </marker>
      </defs>
      <g className="ld-loop-ring" fill="none" strokeWidth="3" strokeLinecap="round">
        <path d="M 255 76 A 150 150 0 0 1 355 246" markerEnd="url(#c-loop-arrow)" />
        <path d="M 300 334 A 150 150 0 0 1 120 334" markerEnd="url(#c-loop-arrow)" />
        <path d="M 100 310 A 150 150 0 0 1 165 76" markerEnd="url(#c-loop-arrow)" />
      </g>
      <g className="ld-loop-node ld-loop-learn" transform="translate(210 60)">
        <circle r="44" />
        <text y="-2">Micro-</text>
        <text y="14">Learning</text>
      </g>
      <g className="ld-loop-node ld-loop-practice" transform="translate(340 285)">
        <circle r="40" />
        <text y="6">Practice</text>
      </g>
      <g className="ld-loop-node ld-loop-prove" transform="translate(80 285)">
        <circle r="40" />
        <text y="6">Prove</text>
      </g>
      <g className="ld-loop-center">
        <text x="210" y="186" textAnchor="middle">
          +1 verified skill
        </text>
        <text x="210" y="210" textAnchor="middle" className="ld-loop-center-sub">
          every pass
        </text>
        <text x="210" y="243" textAnchor="middle" className="ld-loop-center-gap">
          gap found → targeted lesson
        </text>
      </g>
    </svg>
  )
}

/** One grant measure per card: the name and when it is captured. */
function MeasureList({
  measures,
  columns,
}: {
  measures: { name: string; when: string }[]
  columns: 2 | 3
}) {
  return (
    <ul className={`c-measure-grid c-measure-grid-${columns}`}>
      {measures.map((m) => (
        <li key={m.name}>
          <i aria-hidden="true">
            <CheckIcon />
          </i>
          <div>
            <strong>{m.name}</strong>
            <span className="ld-mono c-measure-when">
              <span className="ld-faint">TRACKED · </span>
              {m.when.toUpperCase()}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function HomePage() {
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
          <SiteAccountMenu
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
              Tr<span className="ld-orange">ai</span>ning that adapts.{' '}
              <span className="c-hero-line">
                Admin work, <span className="ld-orange">automated.</span>
              </span>
            </h1>
            <p className="ld-lead">
              Every learner follows a different path. The goal is the same: job-ready skills. One
              learning system for workforce development organizations, colleges, nonprofits,
              training providers and employer academies. It uses AI to adapt each learner’s plan to
              close the gap between what they can do and what the job needs. It replaces the
              spreadsheets and disconnected tools and automates the administrative work. Staff get
              time back to support participants.
            </p>
            <div className="ld-hero-actions">
              <a href="#demo" className="ld-btn ld-btn-orange ld-btn-lg">
                Book a walkthrough
              </a>
              <a href="#path" className="ld-btn ld-btn-ink ld-btn-lg">
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
            {MEASURES.map((m) => (
              <li key={m.name}>
                <span className="ld-mono ld-eyebrow">{m.name.toUpperCase()}</span>
                <span>{m.how}</span>
              </li>
            ))}
          </ul>
        </div>

        <section id="path" className="ld-wrap ld-section">
          <div className="ld-section-head ld-ruled">
            <div>
              <p className="ld-mono ld-eyebrow">HOW IT WORKS · MODERN LEARNING</p>
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
          <PaceTracks />
          <div className="c-loopgrid">
            <div className="c-loop-figure">
              <LoopDiagram />
            </div>
            <ol className="c-loop">
              {LOOP.map((s, i) => (
                <li key={s.key} className={`c-loop-step c-loop-${s.key}`}>
                  <span className="c-loop-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="ld-h3">{s.title}</h3>
                    <p>{s.body}</p>
                  </div>
                </li>
              ))}
              <li className="c-loop-step c-loop-again">
                <span className="c-loop-n" aria-hidden="true">
                  ↺
                </span>
                <div>
                  <h3 className="ld-h3">Again, on the gap</h3>
                  <p>
                    A miss adds the next lesson, not a retake of the course. Every pass adds a
                    verified skill to the record.
                  </p>
                </div>
              </li>
            </ol>
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
                <p className="ld-mono ld-eyebrow-sky">
                  FOR YOUR TEAM · ONE SEAMLESS APP · BETTER OUTCOMES · HOURS SAVED
                </p>
                <h2 className="ld-h2">Learners job-ready faster. Your team’s hours back.</h2>
              </div>
              <p className="ld-sub">
                Skills that match what employers are hiring for, documented as they are gained. What
                your team does by hand today, in separate places, then aggregates for the report,
                happens once, in one app, on one learner record. Nothing is entered twice.
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
                  <span className="ld-mono ld-eyebrow">AUTOMATED BY</span>
                  <a href={productPagePath(PRODUCTS[i])} className="c-component-name">
                    {c.name}
                  </a>
                  <span className="c-component-now">{c.now}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="outcomes" className="ld-paper ld-rounded-top ld-overlap">
          <div className="ld-wrap ld-section">
            <div className="ld-section-head">
              <div>
                <p className="ld-mono ld-eyebrow">OUTCOMES ALREADY TRACKED</p>
                <h2 className="ld-h2">Report once, in the terms your funders use.</h2>
              </div>
              <p className="ld-sub">
                The five measures your grants are held to are defined once and tracked as learners
                work, so the quarterly report is an export, not a project. {PROVENANCE}
              </p>
            </div>
            <figure className="ld-state-shot c-shot">
              <TourVideo />
              <figcaption className="ld-small ld-faint">
                The real product, in forty seconds: a state’s view across providers, one provider,
                one cohort’s gradebook, attendance in a tap, the export. Fictional providers and
                sample data.
              </figcaption>
            </figure>
            <div className="c-report">
              <div className="c-report-head">
                <span className="ld-mono">THE MEASURES YOUR GRANT IS HELD TO</span>
                <span className="ld-mono c-report-dim">ONE RECORD · EXPORTED WHEN YOU NEED IT</span>
              </div>
              <div className="c-measure-strip">
                <h3 className="c-measure-heading">Automatically track and report on:</h3>
                <MeasureList measures={MEASURES} columns={3} />
                <h3 className="c-measure-heading">
                  Plus two more the grant will ask for during an audit:
                </h3>
                <MeasureList measures={MEASURES_MORE} columns={2} />
              </div>
            </div>
          </div>
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
            <h2 className="ld-cta-title">
              See a cohort run <span className="ld-orange">end to end.</span>
            </h2>
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
                <a href="#team">Products</a>
                <a href="/release-notes/">Release notes</a>
                <a href="/privacy">Privacy</a>
                <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
              </nav>
            </footer>
          </div>
        </section>
      </main>
      <FloatingCta />
    </div>
  )
}
