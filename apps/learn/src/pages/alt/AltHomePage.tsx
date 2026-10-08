import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { CONTACT_EMAIL } from '../../contact'
import { AccountMenu } from '../../auth'
import { ProductsMenu } from '../../components/ProductsMenu'
import { PRODUCTS, productPagePath } from '../../products'
import { PATHWAYS } from '../homeContent'
import {
  BUY,
  LEDGER,
  PERSONAS,
  PILOT,
  SPECS,
  STORY,
  STRIP,
  WHY,
  type StoryStep,
} from './altContent'
import '../home.css'
import './alt-home.css'

// Pilot requests open the visitor's mail app; there is no backend form yet.
function startPilot(e: FormEvent<HTMLFormElement>) {
  e.preventDefault()
  const email = new FormData(e.currentTarget).get('email')?.toString() ?? ''
  const subject = encodeURIComponent('Learn Differently pilot')
  const body = encodeURIComponent(`Please contact me about a pilot cohort: ${email}`)
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
}

const STAGES: { key: StoryStep['stage']; label: string }[] = [
  { key: 'start', label: 'Place' },
  { key: 'learn', label: 'Learn' },
  { key: 'practice', label: 'Practice' },
  { key: 'prove', label: 'Prove' },
  { key: 'gap', label: 'Gap' },
  { key: 'hired', label: 'Hired' },
]

/** How many skills Maya's record holds at each step of the story. */
const SKILLS_AT: Record<StoryStep['stage'], number> = {
  start: 0,
  learn: 0,
  practice: 0,
  prove: 1,
  gap: 1,
  hired: 4,
}

const NAV = [
  { href: '#story', label: 'The loop' },
  { href: '#pieces', label: 'Five pieces' },
  { href: '#you', label: 'For you' },
  { href: '#proof', label: 'Proof' },
]

/** The loop as a dial: six stops, the active one lit. */
function LoopDial({ active }: { active: StoryStep['stage'] }) {
  const r = 120
  const n = STAGES.length
  const activeIndex = STAGES.findIndex((s) => s.key === active)
  const skills = SKILLS_AT[active]
  return (
    <div className="alt-dial">
      <svg
        viewBox="0 0 320 320"
        role="img"
        aria-label={`The loop at the ${STAGES[activeIndex]?.label ?? ''} step, ${skills} verified ${skills === 1 ? 'skill' : 'skills'}`}
      >
        <circle cx="160" cy="160" r={r} className="alt-dial-ring" />
        {STAGES.map((s, i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2
          const x = 160 + r * Math.cos(a)
          const y = 160 + r * Math.sin(a)
          const on = i === activeIndex
          const done = i < activeIndex
          const cls = on
            ? 'alt-dial-stop alt-dial-on'
            : done
              ? 'alt-dial-stop alt-dial-done'
              : 'alt-dial-stop'
          return (
            <g key={s.key} transform={`translate(${x} ${y})`} className={cls}>
              <circle r={on ? 22 : 14} />
              <text y="38" textAnchor="middle">
                {s.label}
              </text>
            </g>
          )
        })}
        <text x="160" y="150" textAnchor="middle" className="alt-dial-num">
          {skills}
        </text>
        <text x="160" y="176" textAnchor="middle" className="alt-dial-cap">
          verified {skills === 1 ? 'skill' : 'skills'}
        </text>
      </svg>
    </div>
  )
}

/** Small mock interfaces for the story cards, built in CSS. */
function StoryMock({ stage }: { stage: StoryStep['stage'] }) {
  if (stage === 'start')
    return (
      <div className="alt-mock alt-mock-plan">
        <div className="alt-mock-row">
          <span className="alt-mono">PRETEST</span>
          <span className="alt-mono">PLAN</span>
        </div>
        <div className="alt-mock-plan-row">
          <strong>Maya · 80%</strong>
          <span className="alt-plan-bar">
            <i style={{ width: '20%' }} />
          </span>
          <span className="alt-mono">2 OF 10 MODULES</span>
        </div>
        <div className="alt-mock-plan-row">
          <strong>Theo · 34%</strong>
          <span className="alt-plan-bar">
            <i style={{ width: '92%' }} />
          </span>
          <span className="alt-mono">9 OF 10 MODULES</span>
        </div>
      </div>
    )
  if (stage === 'learn')
    return (
      <div className="alt-mock alt-mock-phone">
        <div className="alt-phone">
          <span className="alt-mono">LESSON · 3:00</span>
          <strong>Password resets and MFA</strong>
          <span className="alt-phone-video" aria-hidden="true">
            <i />
          </span>
          <span className="alt-phone-next">Next: the exercise →</span>
        </div>
      </div>
    )
  if (stage === 'practice')
    return (
      <div className="alt-mock alt-mock-chat">
        <div className="alt-msg">
          <b>AI help desk agent</b>
          Caller says they are locked out and asks for a reset. Draft reply ready. Send?
        </div>
        <div className="alt-msg alt-msg-you">
          <b>You</b>
          Not yet. Verifying the caller first: employee ID and the number on file.
        </div>
        <div className="alt-msg">
          <b>AI help desk agent</b>
          Number on file does not match. Flagging as possible social engineering.
        </div>
      </div>
    )
  if (stage === 'prove')
    return (
      <div className="alt-mock alt-mock-score">
        <div className="alt-mock-row">
          <span className="alt-mono">ATTEMPT 1 · SCORED</span>
          <span className="alt-stamp">VERIFIED</span>
        </div>
        {[
          ['Caller verification', 92],
          ['Catching the wrong fix', 88],
          ['DNS lookup', 74],
          ['Tone with the caller', 90],
        ].map(([k, v]) => (
          <div key={k as string} className="alt-score-row">
            <span>{k}</span>
            <span className="alt-score-bar">
              <i style={{ width: `${v}%` }} />
            </span>
            <span className="alt-mono">{v}%</span>
          </div>
        ))}
        <span className="alt-mono alt-dim">PASS MARK 80 · WORK SAMPLE SAVED</span>
      </div>
    )
  if (stage === 'gap')
    return (
      <div className="alt-mock alt-mock-diff">
        <span className="alt-mono">MAYA’S PLAN · UPDATED 8:17</span>
        <div className="alt-diff-row">
          <span className="alt-diff-ok" aria-hidden="true">
            ✓
          </span>
          Password resets and MFA
        </div>
        <div className="alt-diff-row">
          <span className="alt-diff-ok" aria-hidden="true">
            ✓
          </span>
          Caller verification
        </div>
        <div className="alt-diff-row alt-diff-add">
          <span className="alt-diff-plus" aria-hidden="true">
            +
          </span>
          DNS basics · 4 min <em>weakest rubric row</em>
        </div>
        <div className="alt-diff-row alt-diff-next">
          <span aria-hidden="true">→</span>
          The Monday-morning queue · simulation
        </div>
      </div>
    )
  return (
    <div className="alt-mock alt-mock-match">
      <div className="alt-mock-row">
        <span className="alt-mono">TALENT MATCH · EMPLOYER VIEW</span>
        <span className="alt-mono alt-dim">SHARED BY MAYA</span>
      </div>
      <strong className="alt-match-name">Maya R. · Help desk technician</strong>
      <div className="alt-chips">
        {['Caller verification', 'Ticket triage', 'Phishing response', 'Directing an AI agent'].map(
          (s) => (
            <span key={s}>{s}</span>
          )
        )}
      </div>
      <span className="alt-match-foot">Open work sample · Book interview</span>
    </div>
  )
}

/** The story: sticky dial on the left, one card per move on the right. */
function Story() {
  const [active, setActive] = useState<StoryStep['stage']>('start')
  const refs = useRef<(HTMLElement | null)[]>([])
  useEffect(() => {
    const els = refs.current.filter((e): e is HTMLElement => !!e)
    if (els.length === 0 || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        // The card closest to the middle of the viewport wins.
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (hit) setActive((hit.target as HTMLElement).dataset.stage as StoryStep['stage'])
      },
      { rootMargin: '-40% 0px -40% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  return (
    <div className="alt-story">
      <div className="alt-story-side">
        <LoopDial active={active} />
        <p className="alt-story-note">
          Maya, Theo and the times are illustrative. The loop is how the product is built to work.
        </p>
      </div>
      <ol className="alt-story-steps">
        {STORY.map((s, i) => (
          <li
            key={s.key}
            data-stage={s.stage}
            ref={(el) => {
              refs.current[i] = el
            }}
            className={`alt-step${active === s.stage ? ' alt-step-on' : ''}`}
          >
            <div className="alt-step-copy">
              <span className="alt-mono alt-step-label">{s.label}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
            <StoryMock stage={s.stage} />
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Five ways to say it: the segmented control and its panel. */
function ForYou() {
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
    document.getElementById(`alt-you-${PERSONAS[to].key}`)?.focus()
  }
  return (
    <div className="alt-you">
      <div className="alt-seg" role="tablist" aria-label="Who are you">
        {PERSONAS.map((x, i) => (
          <button
            key={x.key}
            id={`alt-you-${x.key}`}
            type="button"
            role="tab"
            aria-selected={x.key === p.key}
            aria-controls="alt-you-panel"
            tabIndex={x.key === p.key ? 0 : -1}
            className={x.key === p.key ? 'alt-seg-btn alt-seg-on' : 'alt-seg-btn'}
            onClick={() => setKey(x.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {x.tab}
          </button>
        ))}
      </div>
      <div
        id="alt-you-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`alt-you-${p.key}`}
        className="alt-you-panel"
      >
        <div className="alt-you-copy">
          <h3 className="alt-h2">{p.headline}</h3>
          <p className="alt-lead">{p.lead}</p>
          <ul className="alt-you-points">
            {p.points.map((pt) => (
              <li key={pt}>{pt}</li>
            ))}
          </ul>
          <a href={p.key === 'learner' ? '/sign-in' : '#pilot'} className="alt-btn alt-btn-ink">
            {p.cta}
          </a>
        </div>
        <div className="alt-you-metric">
          <span className="alt-mono">{p.metricLabel.toUpperCase()}</span>
          <strong>{p.metric}</strong>
          <span>{p.metricNote}</span>
        </div>
      </div>
    </div>
  )
}

export function AltHomePage() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="alt">
      <header className="alt-header">
        <div className="alt-wrap alt-header-in">
          <a href="/" className="alt-brand">
            <span className="alt-mark" aria-hidden="true" />
            <span className="alt-wordmark">
              learn<span className="alt-wordmark-slash">/</span>differently
            </span>
          </a>
          <nav aria-label="Main" className="alt-nav">
            <ProductsMenu hrefFor={(p) => ({ href: productPagePath(p) })} />
            {NAV.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="alt-actions ld">
            <button
              type="button"
              className="alt-menu-btn"
              aria-expanded={menuOpen}
              aria-controls="alt-menu"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              Menu
            </button>
            <AccountMenu
              signedOut={
                <>
                  <a href="/sign-in" className="alt-signin">
                    Sign in
                  </a>
                  <a href="#pilot" className="alt-btn alt-btn-lime">
                    Start a pilot
                  </a>
                </>
              }
            />
          </div>
        </div>
        {/* Small screens: the same links as a column under the header. */}
        <nav id="alt-menu" aria-label="Main, small screens" className="alt-menu" hidden={!menuOpen}>
          <div className="alt-wrap">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)}>
                {n.label}
              </a>
            ))}
            {PRODUCTS.map((p) => (
              <a key={p.id} href={productPagePath(p)} className="alt-menu-sub">
                {p.name}
              </a>
            ))}
            <a href="/sign-in">Sign in</a>
          </div>
        </nav>
      </header>

      <main>
        <section className="alt-hero">
          <div className="alt-wrap alt-hero-in">
            <div className="alt-hero-copy">
              <p className="alt-mono alt-eyebrow">WORKFORCE TRAINING FOR WORK ALONGSIDE AI</p>
              <h1 className="alt-h1">
                Training that behaves like <em>the job.</em>
              </h1>
              <p className="alt-lead alt-hero-lead">
                Short lessons that end in real work. Real work that becomes proof. Proof an employer
                can open. Every learner on their own path to the same outcome.
              </p>
              <div className="alt-hero-actions">
                <a href="#pilot" className="alt-btn alt-btn-lime alt-btn-lg">
                  Start a pilot
                </a>
                <a href="#story" className="alt-btn alt-btn-ghost alt-btn-lg">
                  Follow one learner ↓
                </a>
              </div>
              <p className="alt-hero-who">
                For workforce agencies, training providers, colleges and employers.{' '}
                <a href="/sign-in">Sent here by your program? Sign in.</a> Not in a program yet? Ask
                your local workforce center or college.
              </p>
            </div>
            <figure className="alt-ledger">
              <div className="alt-ledger-head">
                <span className="alt-mono">THE RECORD · ONE MORNING</span>
                <span className="alt-mono alt-sample">SAMPLE</span>
              </div>
              <ol>
                {LEDGER.map((e, i) => (
                  <li
                    key={i}
                    className={`alt-ledger-row alt-k-${e.kind}`}
                    style={{ '--i': i } as CSSProperties}
                  >
                    <span className="alt-mono alt-ledger-t">{e.t}</span>
                    <span className="alt-ledger-who">{e.who}</span>
                    <span className="alt-ledger-what">{e.what}</span>
                    <span className="alt-ledger-detail">{e.detail}</span>
                  </li>
                ))}
              </ol>
              <figcaption className="alt-mono alt-dim">
                SAMPLE EVENTS · FICTIONAL LEARNERS AND EMPLOYERS
              </figcaption>
            </figure>
          </div>
        </section>

        <div className="alt-wrap">
          <ul className="alt-strip" aria-label="What you get">
            {STRIP.map((s) => (
              <li key={s.k}>
                <span className="alt-mono alt-eyebrow">{s.k}</span>
                <span>{s.v}</span>
              </li>
            ))}
          </ul>
        </div>

        <section id="story" className="alt-wrap alt-section">
          <div className="alt-head">
            <p className="alt-mono alt-eyebrow">THE LOOP</p>
            <h2 className="alt-h2">
              Every learner takes a different path. <em>Same outcome.</em>
            </h2>
            <p className="alt-lead">
              Nobody takes a class and can suddenly do the job. People learn a little, try it, find
              the gap, and learn exactly what closes it. Follow one learner through a week of it.
            </p>
          </div>
          <Story />
        </section>

        <section id="pieces" className="alt-dark">
          <div className="alt-wrap alt-section">
            <div className="alt-head">
              <p className="alt-mono alt-eyebrow">FIVE PIECES, ONE RECORD</p>
              <h2 className="alt-h2">
                Five tools. <em>One learner record.</em>
              </h2>
              <p className="alt-lead">
                Each piece does one job and writes to the same record, so nothing is re-entered and
                proof travels with the person.
              </p>
            </div>
            <ol className="alt-pieces">
              {PRODUCTS.map((p, i) => (
                <li key={p.id} className="alt-piece">
                  <span className="alt-mono alt-piece-role">
                    0{i + 1} · {p.role.toUpperCase()}
                  </span>
                  <h3>{p.name}</h3>
                  <p>{p.tagline}</p>
                  <div className="alt-piece-foot">
                    <span className={p.status === 'available' ? 'alt-dot alt-dot-on' : 'alt-dot'}>
                      {p.status === 'available' ? 'Running' : 'Coming soon'}
                    </span>
                    <a href={productPagePath(p)}>
                      About <span aria-hidden="true">→</span>
                    </a>
                  </div>
                </li>
              ))}
            </ol>
            <div className="alt-record">
              <span className="alt-mono">THE RECORD</span>
              <p>
                Enrollment and attendance from Learning Management. Lesson views from Micro
                Learning. Attempts, scores and verified skills from the Skill Simulator. Matches
                from Job Board Match and hires from Talent Match when they ship. One person, one
                record, reported once.
              </p>
            </div>
          </div>
        </section>

        <section id="you" className="alt-wrap alt-section">
          <div className="alt-head">
            <p className="alt-mono alt-eyebrow">FOR YOU</p>
            <h2 className="alt-h2">
              The same loop, <em>from your seat.</em>
            </h2>
          </div>
          <ForYou />
        </section>

        <section id="pathways" className="alt-wrap alt-section">
          <div className="alt-head">
            <p className="alt-mono alt-eyebrow">PATHWAYS</p>
            <h2 className="alt-h2">
              Practice the job <em>before day one.</em>
            </h2>
            <p className="alt-lead">
              Each pathway pairs short lessons with a simulation of the judgment the job now needs:
              directing an AI agent, checking its output, fixing its mistakes.
            </p>
          </div>
          <ul className="alt-cards">
            {PATHWAYS.map((p) => (
              <li key={p.id} className="alt-card">
                <span className="alt-mono alt-dim">{p.sector.toUpperCase()}</span>
                <h3>{p.title}</h3>
                <p className="alt-card-sim">
                  <strong>{p.simulationTitle}.</strong> {p.simulation}
                </p>
                <div className="alt-chips">
                  {p.skills.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </div>
                <span className="alt-card-roles">{p.roles.join(' · ')}</span>
              </li>
            ))}
            <li className="alt-card alt-card-own">
              <h3>Bring your own.</h3>
              <p>
                Your curriculum becomes the pathway. We build the simulation with your
                subject-matter experts.
              </p>
              <a href="#pilot" className="alt-btn alt-btn-lime">
                Talk about a pathway
              </a>
            </li>
          </ul>
          <p className="alt-mono alt-dim">
            EXAMPLE PATHWAYS · SCENARIOS, SKILLS AND ROLES ARE ILLUSTRATIVE
          </p>
        </section>

        <section id="proof" className="alt-cream">
          <div className="alt-wrap alt-section">
            <div className="alt-head">
              <p className="alt-mono alt-eyebrow">PROOF</p>
              <h2 className="alt-h2">
                Measure what happened to the learner, <em>not whether they finished.</em>
              </h2>
              <p className="alt-lead">
                Skill gains, credentials and exit records come from the platform, in the measures
                WIOA and Perkins reports use. Employment and earnings after exit come from your
                state’s wage-record match; the exit file exports in the shape it needs.
              </p>
            </div>
            <div className="alt-proof">
              <figure className="alt-shot">
                <img
                  src="/site/agency-dashboard.jpg"
                  width="1280"
                  height="860"
                  loading="lazy"
                  alt="A state workforce board's outcomes dashboard: participants enrolled, completion rate, learners who reached the target score, interview-ready count, then assessment scores before and after training for each provider"
                />
                <figcaption className="alt-mono alt-dim">
                  WHAT A STATE SEES ACROSS THE PROVIDERS IT FUNDS · FICTIONAL PROVIDERS, SAMPLE DATA
                  · “INTERVIEW READY” MEANS THE LEARNER’S BEST PRACTICE INTERVIEW MET THE PROGRAM’S
                  THRESHOLD
                </figcaption>
              </figure>
              <div className="alt-proof-side">
                <div className="alt-why">
                  {WHY.map((w) => (
                    <div key={w.n}>
                      <strong>{w.n}</strong>
                      <span>{w.s}</span>
                    </div>
                  ))}
                  <span className="alt-mono alt-dim">
                    WORLD ECONOMIC FORUM, FUTURE OF JOBS 2025
                  </span>
                </div>
                <div className="alt-running">
                  <span className="alt-mono">RUNNING TODAY</span>
                  <ul>
                    <li>
                      <span className="alt-dot alt-dot-on">Learning Management</span>
                    </li>
                    <li>
                      <span className="alt-dot alt-dot-on">Skill Simulator</span>
                    </li>
                    <li>
                      <span className="alt-dot">Micro Learning, Job Board Match, Talent Match</span>
                    </li>
                    <li>
                      <a href="/release-notes/">Release notes, updated as things ship →</a>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="specs" className="alt-wrap alt-section">
          <div className="alt-head">
            <p className="alt-mono alt-eyebrow">SPEC SHEET</p>
            <h2 className="alt-h2">
              Standards, <em>not lock-in.</em>
            </h2>
          </div>
          <dl className="alt-specs">
            {SPECS.map((s) => (
              <div key={s.k}>
                <dt className="alt-mono">{s.k.toUpperCase()}</dt>
                <dd>{s.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="pilot" className="alt-dark alt-pilot">
          <div className="alt-wrap alt-section">
            <h2 className="alt-h2 alt-h2-xl">
              Start with <em>one cohort.</em>
            </h2>
            <ol className="alt-pilot-steps">
              {PILOT.map((s, i) => (
                <li key={s.t}>
                  <span className="alt-mono">0{i + 1}</span>
                  <strong>{s.t}</strong>
                  <span>{s.b}</span>
                </li>
              ))}
            </ol>
            <div className="alt-buy">
              <span className="alt-mono">HOW YOU BUY · PRICED PER PARTNER</span>
              <ul>
                {BUY.map((b) => (
                  <li key={b.k}>
                    <strong>{b.k}</strong> {b.v}
                  </li>
                ))}
              </ul>
              <span className="alt-buy-note">
                States: pilot with two or three funded providers on one tenant, then license
                statewide.
              </span>
            </div>
            <form className="alt-form" onSubmit={startPilot}>
              <label htmlFor="alt-email" className="ld-visually-hidden">
                Work email
              </label>
              <input id="alt-email" name="email" type="email" required placeholder="Work email" />
              <button type="submit" className="alt-btn alt-btn-lime">
                Start a pilot
              </button>
              <span className="alt-mono alt-dim">OPENS YOUR EMAIL APP</span>
            </form>
          </div>
        </section>
      </main>

      <footer className="alt-dark alt-footer-wrap">
        <div className="alt-wrap alt-footer">
          <span className="alt-wordmark">
            learn<span className="alt-wordmark-slash">/</span>differently
          </span>
          <nav aria-label="Footer">
            <a href="#pieces">Products</a>
            <a href="#specs">Standards</a>
            <a href="/release-notes/">Release notes</a>
            <a href="/privacy">Privacy</a>
            <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
