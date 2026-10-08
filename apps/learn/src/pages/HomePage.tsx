import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { CONTACT_EMAIL } from '../contact'
import { AccountMenu } from '../auth'
import { ProductsMenu } from '../components/ProductsMenu'
import { PRODUCTS, productPagePath } from '../products'
import {
  AUDIENCES,
  BREAKS,
  JOURNEY,
  LICENSING,
  LOOP,
  PATHWAYS,
  PILOT_STEPS,
  RULES,
  SAME_START,
  SHIFTS,
  STACK,
  TRACKED,
  WHY_NOW,
} from './homeContent'
import './home.css'

// Walkthrough requests open the visitor's mail app; there is no backend form yet.
function bookWalkthrough(e: FormEvent<HTMLFormElement>) {
  e.preventDefault()
  const email = new FormData(e.currentTarget).get('email')?.toString() ?? ''
  const subject = encodeURIComponent('Learn Differently walkthrough')
  const body = encodeURIComponent(`Please contact me to book a walkthrough: ${email}`)
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
}

const pad = (n: number) => String(n).padStart(2, '0')

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

/** The loop in miniature: one lesson, one simulation, one verified skill, one match. */
function HeroCards() {
  return (
    <div className="ld-hero-cards" aria-label="The learning loop, illustrated">
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

/** Learn, practice, prove, drawn as a circle with the gap arrow back to the top. */
function LoopDiagram() {
  // Three nodes on a circle of radius 150 around (210, 210): top, lower right, lower left.
  return (
    <svg
      className="ld-loop-svg"
      viewBox="0 0 420 420"
      role="img"
      aria-label="The loop: learn, then practice, then prove, then back to learn"
    >
      <defs>
        <marker
          id="ld-arrow"
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
        <path d="M 255 76 A 150 150 0 0 1 355 246" markerEnd="url(#ld-arrow)" />
        <path d="M 300 334 A 150 150 0 0 1 120 334" markerEnd="url(#ld-arrow)" />
        <path d="M 100 310 A 150 150 0 0 1 165 76" markerEnd="url(#ld-arrow)" />
      </g>
      <g className="ld-loop-node ld-loop-learn" transform="translate(210 60)">
        <circle r="40" />
        <text y="6">Learn</text>
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

function PathwaysExplorer() {
  const [active, setActive] = useState(PATHWAYS[0].id)
  const p = PATHWAYS.find((x) => x.id === active) ?? PATHWAYS[0]
  // Arrow keys move between tabs (and select); only the active tab is in the Tab order.
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = PATHWAYS.length - 1
    const to =
      e.key === 'ArrowRight'
        ? (index + 1) % PATHWAYS.length
        : e.key === 'ArrowLeft'
          ? (index + last) % PATHWAYS.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1
    if (to < 0) return
    e.preventDefault()
    setActive(PATHWAYS[to].id)
    document.getElementById(`ld-pw-tab-${PATHWAYS[to].id}`)?.focus()
  }
  return (
    <div className="ld-pathways">
      <div className="ld-pathway-tabs" role="tablist" aria-label="Example pathways">
        {PATHWAYS.map((x, i) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            id={`ld-pw-tab-${x.id}`}
            aria-selected={x.id === p.id}
            aria-controls="ld-pw-panel"
            tabIndex={x.id === p.id ? 0 : -1}
            className={x.id === p.id ? 'ld-pathway-tab ld-pathway-tab-on' : 'ld-pathway-tab'}
            onClick={() => setActive(x.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span className="ld-mono ld-pathway-sector">{x.sector.toUpperCase()}</span>
            <span className="ld-pathway-name">{x.title}</span>
          </button>
        ))}
      </div>
      <div
        id="ld-pw-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`ld-pw-tab-${p.id}`}
        className="ld-pathway-panel"
      >
        <article className="ld-pathway-sim">
          <p className="ld-mono ld-steel">WORK SIMULATION · WITH AN AI AGENT</p>
          <h3 className="ld-pathway-sim-title">{p.simulationTitle}</h3>
          <p className="ld-pathway-sim-body">{p.simulation}</p>
          <p className="ld-mono ld-steel ld-pathway-sim-foot">
            EVERY ATTEMPT IS SCORED · A PASS EARNS A VERIFIED SKILL
          </p>
        </article>
        <div className="ld-pathway-facts">
          <section>
            <p className="ld-mono ld-eyebrow">MICROLEARNING</p>
            <ul className="ld-pathway-list">
              {p.lessons.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>
          <section>
            <p className="ld-mono ld-eyebrow">SKILLS PROVEN</p>
            <ul className="ld-pathway-chips">
              {p.skills.map((s) => (
                <li key={s}>
                  <CheckIcon /> {s}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <p className="ld-mono ld-eyebrow">MATCHED ROLES</p>
            <p className="ld-pathway-roles">{p.roles.join(' · ')}</p>
          </section>
        </div>
      </div>
    </div>
  )
}

export function HomePage() {
  return (
    <div className="ld">
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
              <a href="#loop">How it works</a>
            </li>
            <li>
              <a href="#pathways">Pathways</a>
            </li>
            <li>
              <a href="#outcomes">Outcomes</a>
            </li>
            <li>
              <a href="#who">Who it&apos;s for</a>
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
            <h1 className="ld-hero-title">
              Learn.
              <br />
              Practice.
              <br />
              Prove.
              <br />
              <span className="ld-orange">Get hired.</span>
            </h1>
            <p className="ld-lead">
              Five connected tools, one learning loop. Short lessons end in real exercises,
              exercises become verified skills, and verified skills match learners to jobs. For
              training providers, colleges and workforce agencies.
            </p>
            <div className="ld-hero-actions">
              <a href="#demo" className="ld-btn ld-btn-orange ld-btn-lg">
                Book a walkthrough
              </a>
              <a href="#platform" className="ld-btn ld-btn-outline ld-btn-lg">
                See the five pieces
              </a>
            </div>
            <p className="ld-mono ld-faint">
              SKILLS VERIFIED FROM THE FIRST EXERCISE, NOT THE FINAL EXAM
            </p>
            <p className="ld-hero-learner">
              Sent here by your program? <a href="/sign-in">Sign in</a> with the account they gave
              you. Not enrolled yet? <a href="#pathways">See what you would actually do →</a>
            </p>
          </div>
          <HeroCards />
        </section>

        <div className="ld-wrap">
          <hr className="ld-rule" />
        </div>

        <section id="breaks" className="ld-wrap ld-section">
          <div className="ld-section-head">
            <div>
              <p className="ld-mono ld-eyebrow">WHERE TRAINING BREAKS</p>
              <h2 className="ld-h2">
                Learners juggle disconnected tools, and their skills stay invisible.
              </h2>
            </div>
            <p className="ld-sub">
              A course in one system, videos in another, no chance to practice the actual job, then
              a job board where none of that work is visible. Four handoffs, four places to lose
              people.
            </p>
          </div>
          <div className="ld-start" aria-label="Two learners who start from the same seat">
            {SAME_START.map((s) => (
              <article key={s.name} className={`ld-start-card ld-start-${s.tone}`}>
                <div className="ld-start-score">
                  <span className="ld-start-figure">{s.score}</span>
                  <span className="ld-mono ld-steel">PRETEST</span>
                </div>
                <p className="ld-start-body">
                  <strong>{s.name}</strong> {s.body}
                </p>
              </article>
            ))}
            <p className="ld-start-foot">
              Same start line, same pace. Both finish with the same certificate, and neither has
              shown an employer what they can do. (Maya and Theo are illustrative.)
            </p>
          </div>
          <ol className="ld-breaks">
            {BREAKS.map((b, i) => (
              <li key={b.title} className="ld-break">
                <span className="ld-mono ld-faint">{pad(i + 1)}</span>
                <span className="ld-break-title">{b.title}</span>
                <span className="ld-break-body">{b.body}</span>
              </li>
            ))}
          </ol>
        </section>

        <section id="loop" className="ld-wrap ld-section">
          <div className="ld-section-head ld-ruled">
            <div>
              <p className="ld-mono ld-eyebrow">THE LOOP</p>
              <h2 className="ld-h2">Every learner takes a different path to the same outcome.</h2>
            </div>
            <p className="ld-sub">
              Nobody takes a class and can suddenly do the job. People learn a little, try it, find
              the gap, and learn exactly what closes it. The loop repeats with every lesson, and
              each pass adds a verified skill.
            </p>
          </div>
          <div className="ld-loop">
            <div className="ld-loop-figure">
              <LoopDiagram />
            </div>
            <ol className="ld-loop-steps">
              {LOOP.map((s, i) => (
                <li key={s.key} className={`ld-loop-step ld-loop-step-${s.key}`}>
                  <span className="ld-loop-step-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <span className="ld-loop-step-title">{s.title}</span>
                    <span className="ld-loop-step-body">{s.body}</span>
                  </div>
                </li>
              ))}
              <li className="ld-loop-step ld-loop-step-again">
                <span className="ld-loop-step-n" aria-hidden="true">
                  ↺
                </span>
                <div>
                  <span className="ld-loop-step-title">Again, on the gap</span>
                  <span className="ld-loop-step-body">
                    A miss points to the next short lesson, not a retake of the course. Learn once,
                    deeply. Learn often, as the work changes.
                  </span>
                </div>
              </li>
            </ol>
          </div>
          <div className="ld-pace">
            <div className="ld-stat ld-stat-dark">
              <span className="ld-stat-figure ld-orange">Moving fast?</span>
              <span>
                Show mastery and move on. Nobody who is nearly interview-ready sits through what
                they already know.
              </span>
            </div>
            <div className="ld-stat">
              <span className="ld-stat-figure">Need more time?</span>
              <span>
                Work at your own pace without feeling behind. The loop meets you where the gap is,
                and still gets you interview-ready.
              </span>
            </div>
            <aside className="ld-journey" aria-label="An illustrative learner's twelve weeks">
              <p className="ld-mono ld-faint">MAYA’S TWELVE WEEKS IN THE LOOP · ILLUSTRATIVE</p>
              <ol>
                {JOURNEY.map((j) => (
                  <li key={j.week} className={j.hired ? 'ld-journey-hired' : undefined}>
                    <span className="ld-mono">{j.week.toUpperCase()}</span>
                    <span>{j.skill}</span>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </section>

        <section id="shift" className="ld-wrap ld-section">
          <div className="ld-section-head ld-ruled">
            <div>
              <p className="ld-mono ld-eyebrow">A DIFFERENT MODEL</p>
              <h2 className="ld-h2">Built for how people learn now.</h2>
            </div>
            <p className="ld-sub">
              Traditional training moves a whole cohort at one pace and finds the gaps at the final
              exam. This model flips each of those habits.
            </p>
          </div>
          <div className="ld-shifts">
            <div className="ld-shifts-head" aria-hidden="true">
              <span className="ld-mono ld-faint">FROM · TRADITIONAL TRAINING</span>
              <span className="ld-mono ld-eyebrow">TO · THIS MODEL</span>
            </div>
            <ul className="ld-shift-list">
              {SHIFTS.map((s) => (
                <li key={s.from} className={s.highlight ? 'ld-shift ld-shift-hl' : 'ld-shift'}>
                  <span className="ld-shift-from">{s.from}</span>
                  <span className="ld-shift-arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="ld-shift-to">{s.to}</span>
                </li>
              ))}
            </ul>
            <p className="ld-small ld-faint ld-shifts-note">
              The highlighted row is the biggest difference: proof starts at the first exercise, so
              it powers job matching for learners and talent matching for employers.
            </p>
          </div>
        </section>

        <section id="platform" className="ld-dark ld-rounded-top">
          <div className="ld-wrap ld-section ld-platform">
            <div className="ld-section-head">
              <div>
                <p className="ld-mono ld-eyebrow-sky">THE PLATFORM</p>
                <h2 className="ld-h2">Five pieces, one learning loop.</h2>
              </div>
              <p className="ld-sub">
                Structure gives the path. Spark keeps people showing up. Practice turns knowledge
                into proof. Proof powers opportunity for learners and placement for employers. Each
                piece stands alone and shares one learner record.
              </p>
            </div>
            <ol className="ld-pieces">
              {PRODUCTS.map((p, i) => (
                <li key={p.id} className="ld-piece">
                  <span className="ld-mono ld-piece-role">
                    {pad(i + 1)} · {p.role.toUpperCase()}
                  </span>
                  <h3 className="ld-piece-name">{p.name}</h3>
                  <p className="ld-piece-tag">{p.tagline}</p>
                  <ul className="ld-piece-list">
                    {p.features.slice(0, 3).map((f) => (
                      <li key={f.title}>{f.title}</li>
                    ))}
                  </ul>
                  <div className="ld-piece-foot">
                    <span
                      className={
                        p.status === 'available'
                          ? 'ld-piece-status ld-piece-live'
                          : 'ld-piece-status'
                      }
                    >
                      {p.status === 'available' ? 'Available now' : 'Coming soon'}
                    </span>
                    <a href={productPagePath(p)} className="ld-piece-link">
                      About <span aria-hidden="true">→</span>
                    </a>
                  </div>
                </li>
              ))}
            </ol>
            <p className="ld-platform-foot">
              <strong>Learn often.</strong> What learners practice and what employers hire for flows
              back into new lessons, so the loop keeps turning as AI changes the work.
            </p>
          </div>
        </section>

        <section id="tour" className="ld-paper ld-rounded-top ld-overlap">
          <div className="ld-wrap ld-section">
            <div className="ld-section-head">
              <div>
                <p className="ld-mono ld-eyebrow">SEE IT RUNNING</p>
                <h2 className="ld-h2">A cohort, end to end, in ninety seconds.</h2>
              </div>
              <p className="ld-sub">
                Enroll a cohort, teach a short lesson, watch a simulation get scored, and export the
                outcomes report. A short tour is on its way; book a walkthrough to see it live
                today.
              </p>
            </div>
            {/* Placeholder for the product-tour GIF or video (#75): replace the inner div with the media. */}
            <figure className="ld-tour-frame">
              <div className="ld-tour-placeholder">
                <span className="ld-tour-play" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="28" height="28">
                    <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
                  </svg>
                </span>
                <span className="ld-tour-label">Product tour</span>
                <span className="ld-small ld-faint">Coming soon</span>
              </div>
              <figcaption className="ld-small ld-faint">
                From enrollment to the outcomes export, on the live product.
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="pathways" className="ld-wrap ld-section">
          <div className="ld-section-head ld-ruled">
            <div>
              <p className="ld-mono ld-eyebrow">WHAT A PATHWAY LOOKS LIKE</p>
              <h2 className="ld-h2">Practice the job before day one.</h2>
            </div>
            <p className="ld-sub">
              Jobs increasingly mean working with AI agents: giving them direction, checking their
              output, fixing their mistakes. Each pathway pairs short lessons with a simulation of
              that judgment, and every attempt becomes evidence an employer can see.
            </p>
          </div>
          <PathwaysExplorer />
          <p className="ld-small ld-faint">
            Example pathways. Scenarios, skills and roles are illustrative.
          </p>
        </section>

        <section id="connects" className="ld-wrap ld-section">
          <div className="ld-section-head ld-ruled">
            <div>
              <p className="ld-mono ld-eyebrow">FITS YOUR STACK</p>
              <h2 className="ld-h2">Connects to what you already run. Standards, not lock-in.</h2>
            </div>
            <p className="ld-sub">
              Fragmented tools and repeat registrations are the pain our partners name first. Learn
              Differently speaks LTI 1.3 and SCORM, keeps your SIS as the system of record, and
              gives every learner one sign-in across all five pieces.
            </p>
          </div>
          <div className="ld-tiles">
            {STACK.map((t) => (
              <article key={t.label} className={t.dark ? 'ld-tile ld-tile-dark' : 'ld-tile'}>
                <span className="ld-mono ld-tile-label">{t.label}</span>
                <h3 className="ld-h3">{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="why" className="ld-dark ld-rounded-top">
          <div className="ld-wrap ld-section ld-why">
            <div className="ld-section-head">
              <div>
                <p className="ld-mono ld-eyebrow-sky">WHY NOW</p>
                <h2 className="ld-h2">The work is changing faster than training can keep up.</h2>
              </div>
              <p className="ld-sub">
                Entry-level work now means reviewing what an agent drafted, catching what a model
                missed, and explaining the fix. That judgment is learned by doing, not by watching.
              </p>
            </div>
            <div className="ld-why-cards">
              {WHY_NOW.map((w) => (
                <article key={w.figure} className={`ld-why-card ld-why-${w.tone}`}>
                  <p className="ld-why-figure">{w.figure}</p>
                  <p className="ld-why-claim">{w.claim}</p>
                </article>
              ))}
              <p className="ld-mono ld-why-source">
                SOURCE: WORLD ECONOMIC FORUM, FUTURE OF JOBS REPORT 2025
              </p>
              <article className="ld-why-rules">
                <div>
                  <p className="ld-mono ld-steel">{RULES.label}</p>
                  <p className="ld-why-rules-figure">{RULES.figure}</p>
                </div>
                <p className="ld-why-rules-body">{RULES.body}</p>
              </article>
            </div>
          </div>
        </section>

        <section id="outcomes" className="ld-paper ld-rounded-top ld-overlap">
          <div className="ld-wrap ld-section ld-outcomes">
            <div className="ld-outcomes-copy">
              <p className="ld-mono ld-eyebrow">OUTCOMES</p>
              <h2 className="ld-h2">
                Measure what happened to the learner, not whether they finished.
              </h2>
              <p className="ld-sub">
                Completion is the floor. Every cohort reports skill gains, credentials, placements
                and employer demand, in the shapes workforce funders and accreditors already use:
                measurable skill gains, credential attainment and employment after exit.
              </p>
              <a href="#demo" className="ld-btn ld-btn-ink">
                Ask for a sample report
              </a>
            </div>
            <table className="ld-tracked">
              <caption className="ld-visually-hidden">What is tracked for every cohort</caption>
              <thead>
                <tr>
                  <th scope="col">Outcome</th>
                  <th scope="col">How it&apos;s tracked</th>
                </tr>
              </thead>
              <tbody>
                {TRACKED.map((t) => (
                  <tr key={t.outcome}>
                    <th scope="row">{t.outcome}</th>
                    <td>{t.how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="state" className="ld-wrap ld-section">
          <div className="ld-section-head ld-ruled">
            <div>
              <p className="ld-mono ld-eyebrow">FOR STATES AND WORKFORCE BOARDS</p>
              <h2 className="ld-h2">One record across every provider you fund.</h2>
            </div>
            <p className="ld-sub">
              Every contractor reports into the same measures with the same definitions, so
              providers sit side by side instead of arriving in a hundred formats. Branded for your
              state, with provider-list renewal data collected once.
            </p>
          </div>
          <figure className="ld-state-shot">
            <img
              src="/site/agency-dashboard.jpg"
              width="1280"
              height="860"
              loading="lazy"
              alt="A state workforce board's outcomes dashboard: participants enrolled, completion rate, learners who reached the target score and interview-ready count, then assessment scores before and after training for each provider"
            />
            <figcaption className="ld-small ld-faint">
              An agency's view across the providers it funds. Fictional providers and sample data.
            </figcaption>
          </figure>
        </section>

        <section id="who" className="ld-wrap ld-section">
          <div className="ld-who-head">
            <h2 className="ld-h2 ld-h2-sm">One platform, five kinds of partners.</h2>
            <p className="ld-mono ld-eyebrow">WHO IT&apos;S FOR</p>
          </div>
          <div className="ld-audiences">
            {AUDIENCES.map((a, i) => (
              <article key={a.title} className="ld-audience">
                <span className="ld-mono ld-faint">{pad(i + 1)}</span>
                <h3 className="ld-h3 ld-h3-lg">{a.title}</h3>
                <p>{a.body}</p>
                <a href="#demo" className="ld-audience-link">
                  {a.cta} <span aria-hidden="true">→</span>
                </a>
              </article>
            ))}
          </div>
          <p className="ld-sub ld-who-foot">
            Each partner gets the same connected loop, set up around its own learners, pathways and
            employer network.
          </p>
        </section>

        <section id="licensing" className="ld-wrap ld-section">
          <div className="ld-section-head ld-ruled">
            <div>
              <p className="ld-mono ld-eyebrow">LICENSING</p>
              <h2 className="ld-h2 ld-h2-sm">Licensed the way your program is funded.</h2>
            </div>
            <p className="ld-sub">
              By the seat, by the cohort, or by the site. Job matching and employer talent search
              are add-ons. Pricing is quoted per partner.
            </p>
          </div>
          <div className="ld-licenses">
            {LICENSING.map((l) => (
              <article key={l.name} className="ld-license">
                <span className="ld-mono ld-tile-label">{l.label}</span>
                <h3 className="ld-h3 ld-h3-lg">{l.name}</h3>
                <p>{l.body}</p>
                <p className="ld-license-best">
                  <span className="ld-mono ld-faint">BEST FOR</span> {l.best}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section id="demo" className="ld-cta ld-rounded-top">
          <div className="ld-wrap ld-cta-inner">
            <h2 className="ld-cta-title">Launch a pilot cohort.</h2>
            <ol className="ld-pilot">
              {PILOT_STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="ld-pilot-n">{i + 1}</span>
                  <span className="ld-pilot-title">{s.title}</span>
                  <span className="ld-pilot-body">{s.body}</span>
                </li>
              ))}
            </ol>
            <div className="ld-cta-row">
              <p className="ld-cta-sub">
                One pathway, one cohort, your employer partners. Thirty minutes to walk through it
                end to end.
              </p>
              <form className="ld-cta-form" onSubmit={bookWalkthrough}>
                <label htmlFor="ld-email" className="ld-visually-hidden">
                  Work email
                </label>
                <input id="ld-email" name="email" type="email" required placeholder="Work email" />
                <button type="submit">Book a walkthrough</button>
              </form>
            </div>
            <footer className="ld-footer">
              <div className="ld-footer-brand">
                <span className="ld-footer-name">learn/differently</span>
                <span>Learn once. Learn often.</span>
                <span className="ld-mono">learndifferently.tech</span>
              </div>
              <nav aria-label="Footer" className="ld-footer-links">
                <a href="#platform">Products</a>
                <a href="#connects">Standards and security</a>
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
