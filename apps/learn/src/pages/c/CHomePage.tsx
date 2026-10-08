import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { CONTACT_EMAIL } from '../../contact'
import { AccountMenu } from '../../auth'
import { ProductsMenu } from '../../components/ProductsMenu'
import { PRODUCTS, productPagePath } from '../../products'
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

/** Design A's hero: a learner in action, one lesson to one match. */
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
        <span className="ld-card-title">Verify the caller</span>
        <span className="ld-progress" aria-hidden="true">
          <span style={{ width: '72%' }} />
        </span>
        <span className="ld-small ld-faint">Ends in a real-world exercise →</span>
      </div>
      <div className="ld-card ld-card-sim">
        <div className="ld-row-between">
          <span className="ld-mono ld-steel">SIMULATION · HELP DESK</span>
          <span className="ld-mono ld-pill">WITH AN AI AGENT</span>
        </div>
        <div className="ld-chat">
          <div className="ld-chat-msg">
            <span className="ld-chat-who">AI help desk agent</span>
            <span>Caller is locked out and asks for a reset. Draft reply ready. Send?</span>
          </div>
          <div className="ld-chat-msg ld-chat-you">
            <span className="ld-chat-who">You</span>
            <span>Not yet. Verifying the caller first: employee ID and number on file.</span>
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
          <span className="ld-card-title">Caller verification</span>
        </div>
      </div>
      <div className="ld-card ld-card-match">
        <span className="ld-mono">ON THE RECORD</span>
        <span className="ld-card-title">Week 1 · Maya R.</span>
        <span className="ld-match-strength">
          <span className="ld-match-dot" aria-hidden="true" />
          Measurable skill gain · documented
        </span>
      </div>
      <p className="ld-small ld-faint ld-hero-note">Sample records for illustration.</p>
    </div>
  )
}

/** Two learners on two tracks of different length, one endpoint. */
function PaceTracks() {
  const longest = Math.max(...PACE.map((p) => p.weeks))
  return (
    <div
      className="c-pace"
      role="img"
      aria-label="Two learners reach the same outcome in different weeks"
    >
      <div className="c-pace-rows">
        {PACE.map((p) => (
          <div key={p.name} className="c-pace-row">
            <div className="c-pace-who">
              <strong>{p.name}</strong>
              <span className="ld-mono ld-faint">ASSESSMENT {p.score}</span>
            </div>
            <div className="c-pace-track">
              <div className="c-pace-line" style={{ width: `${(p.weeks / longest) * 100}%` }}>
                {p.steps.map((s, i) => (
                  <span
                    key={s}
                    className="c-pace-node"
                    style={{ left: `${((i + 1) / (p.steps.length + 1)) * 100}%` }}
                    title={s}
                  >
                    <i aria-hidden="true" />
                    <em>{s}</em>
                  </span>
                ))}
                <span className="c-pace-flag">
                  <CheckIcon /> Week {p.weeks}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="c-pace-end">
        <span className="ld-mono">SAME OUTCOME</span>
        <strong>Verified skills. Interview-ready.</strong>
        <span className="ld-small">On the record, in the funder’s terms.</span>
      </div>
      <p className="c-pace-notes">
        {PACE.map((p) => (
          <span key={p.name}>
            <strong>{p.name}:</strong> {p.note}{' '}
          </span>
        ))}
        <span className="ld-faint">Illustrative.</span>
      </p>
    </div>
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
              <a href="#pathways">Pathways</a>
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
              ONE APPLICATION FOR TRAINING PROVIDERS, COLLEGES AND WORKFORCE AGENCIES
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
                See how it works
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
                <span className="ld-orange">Same outcome.</span>
              </h2>
            </div>
            <p className="ld-sub">
              A skills assessment modeled on the job places each learner. From there, a short
              lesson, a real exercise, a score, and the next lesson chosen by the gap. Strong
              learners move on; others get the full route. Everyone reaches the same bar, and your
              team sees where each person is without asking.
            </p>
          </div>
          <PaceTracks />
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
                <p className="ld-mono ld-eyebrow">ONE APPLICATION, FIVE COMPONENTS</p>
                <h2 className="ld-h2 ld-h2-sm">
                  What your team does by hand today, in separate places, then aggregates for the
                  report.
                </h2>
              </div>
              <p className="ld-sub">
                One sign-in, one learner record. Each component replaces a tool or a spreadsheet the
                team keeps today, and writes to the record the report is built from.
              </p>
            </div>
            <ul className="c-components">
              {COMPONENTS.map((c, i) => {
                const p = PRODUCTS[i]
                return (
                  <li key={c.name} className="c-component">
                    <span className="ld-mono ld-faint">
                      0{i + 1} · {p.role.toUpperCase()}
                    </span>
                    <a href={productPagePath(p)} className="c-component-name">
                      {c.name}
                    </a>
                    <span className="c-component-replaces">
                      Replaces <em>{c.replaces}</em>
                    </span>
                    <span
                      className={
                        p.status === 'available'
                          ? 'ld-piece-status ld-piece-live'
                          : 'ld-piece-status'
                      }
                    >
                      {p.status === 'available' ? 'Available now' : 'Coming soon'}
                    </span>
                  </li>
                )
              })}
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
              <p className="ld-mono ld-eyebrow">PATHWAYS</p>
              <h2 className="ld-h2 ld-h2-sm">Skills that match what employers are hiring for.</h2>
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
