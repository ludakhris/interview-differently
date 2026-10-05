import { type FormEvent } from 'react'
import { CONTACT_EMAIL } from '../contact'
import { AccountMenu } from '../auth'
import { ProductsMenu } from '../components/ProductsMenu'
import { productPagePath } from '../products'
import './home.css'

// Walkthrough requests open the visitor's mail app; there is no backend form yet.

const STEPS = [
  { n: '01', title: 'Enroll', body: 'A cohort, with intake and a baseline assessment.' },
  {
    n: '02',
    title: 'Teach',
    body: 'Recorded micro-lessons with knowledge checks. No SCORM packaging required.',
  },
  { n: '03', title: 'Assess', body: 'Pre and post, timestamped, per learner.' },
  {
    n: '04',
    title: 'Demonstrate',
    body: 'A scored, recorded, structured interview against the role trained for.',
    highlight: true,
  },
  {
    n: '05',
    title: 'Report',
    body: 'Progress documentation and completion records shaped the way WIOA counts them.',
  },
]

const STACK = [
  {
    label: 'LMS',
    title: 'Sits beside Canvas, not in place of it',
    body: 'Launch from inside your LMS or run standalone for cohorts that live outside it. Grades and completions pass back on request.',
  },
  {
    label: 'SIS',
    title: 'Enrollment stays in your SIS',
    body: "Import rosters by CSV. Export completions and skill-gain documentation back to your registration system or your state's case-management system.",
  },
  {
    label: 'CONTENT',
    title: 'Bring your SCORM and Articulate content',
    body: 'Upload existing content in minutes: the SCORM packages and Rise and Storyline output your designers already built. Nothing has to be rebuilt.',
  },
  {
    label: 'SECURITY AND PRIVACY',
    title: 'You own the data. We never train on it.',
    body: 'SSO through your identity provider. FERPA school-official terms. Learner recordings are never used to train models and are deleted on your schedule. Security documentation on request.',
    dark: true,
  },
  {
    label: 'ACCESSIBILITY',
    title: 'Captioned lessons. Spoken or typed interviews.',
    body: 'Every recorded lesson is captioned. Learners answer interview questions by voice or by typing.',
  },
  {
    label: 'WORKFORCE PELL AND WIOA',
    title: 'We produce the completion and skill-gain records',
    body: "Placement comes from your state's wage match. We give you the exit file it needs, with the identifiers your reporting system expects.",
  },
]

const PRICING_POINTS = [
  "A cohort is one offering, one roster, one start date, for the program's published length. Six learners or sixty, same price. Rolling-enrollment programs are one cohort per start.",
  'Everything in: lessons, knowledge checks, pre and post assessments, scored interviews, completion and skill-gain records.',
  'No per-seat license, no authoring tool, no campus contract. Onboarding included.',
  'Running dozens of cohorts a year? An annual license sized by learners, with SSO and SIS integration scoped in writing.',
]

const UNIVERSITY_STACK = [
  {
    title: 'By the campus',
    body: "The LMS is an annual license sized to the whole institution's enrollment. A 24-person cohort pays the campus price, or borrows a seat on someone else's contract.",
  },
  {
    title: 'By the seat, for the people who build the course',
    body: 'Authoring is a separate tool, licensed per author per year, so a ten-minute lesson can be packaged as SCORM before the LMS will play it.',
  },
  {
    title: 'By the enrollment, through a second system',
    body: 'Non-credit learners are registered in a separate platform with its own license and integration fees. Even a flagship with enterprise contracts for both pays two vendors and a help desk on every enrollment.',
  },
  {
    title: 'And the evidence is still assembled by hand',
    body: 'Completion, skill gains and exit records are pulled from three systems into a spreadsheet each quarter, by whoever has time.',
  },
]

const EVIDENCE = [
  {
    figure: '2.67×',
    claim: 'the odds of employment',
    body: 'for job seekers in structured job-search interventions that pair skill practice with motivation, across 47 controlled studies.',
    source: 'LIU, HUANG AND WANG · PSYCHOLOGICAL BULLETIN, 2014',
  },
  {
    figure: (
      <>
        82<span className="ld-evidence-vs"> vs </span>69
      </>
    ),
    claim: 'percent employed at six months',
    body: 'in a randomized trial of simulated interview practice with returning citizens in two Michigan prisons, against services as usual.',
    source: 'SMITH ET AL. · UNIVERSITY OF MICHIGAN, 2022',
  },
  {
    figure: '78%',
    claim: 'of applicants chose the AI interview',
    body: 'when offered one in a 70,000-applicant hiring trial. AI interviews are now part of real hiring. Meet one before it counts.',
    source: 'JABARIAN · UNIVERSITY OF CHICAGO BOOTH, 2025',
    accent: true,
  },
]

const AUDIENCES = [
  {
    title: 'Training providers',
    body: 'On a state Eligible Training Provider List, renewing every year on completion, employment and wage outcomes. Run each cohort here and the renewal data is already in one place.',
    cta: 'For providers',
  },
  {
    title: 'Workforce agencies',
    body: 'Branded for your state, stocked with one offering from each approved provider, and reporting progress in the measures your programs already file.',
    cta: 'For agencies',
  },
  {
    title: 'Continuing-ed and completion programs',
    body: '43 million adults have some college and no credential. Cohort delivery and outcome tracking for the programs bringing them back, outside the degree audit.',
    cta: 'For programs',
  },
]

const SKILL_BARS = [30, 40, 36, 52, 48, 66, 74, 80, 92, 100]

function bookWalkthrough(e: FormEvent<HTMLFormElement>) {
  e.preventDefault()
  const email = new FormData(e.currentTarget).get('email')?.toString() ?? ''
  const subject = encodeURIComponent('Learn Differently walkthrough')
  const body = encodeURIComponent(`Please contact me to book a walkthrough: ${email}`)
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
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
              <a href="#product">How it works</a>
            </li>
            <li>
              <a href="#pricing">Pricing</a>
            </li>
            <li>
              <a href="#rules">Why now</a>
            </li>
            <li>
              <a href="#evidence">Evidence</a>
            </li>
            <li>
              <a href="#stack">Your stack</a>
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
            <h1 className="ld-hero-title">
              Run the
              <br />
              cohort.
              <br />
              <span className="ld-orange">
                Own the
                <br />
                evidence.
              </span>
            </h1>
            <p className="ld-lead">
              The outcomes platform for workforce training. Enroll a cohort, teach in short lessons,
              assess before and after, score a real interview, and export the report your funder
              already asks for.
            </p>
            <div className="ld-hero-actions">
              <a href="#demo" className="ld-btn ld-btn-orange ld-btn-lg">
                Book a walkthrough
              </a>
              <a href="#product" className="ld-btn ld-btn-outline ld-btn-lg">
                See the product
              </a>
              <span className="ld-mono ld-faint">PRICED PER COHORT, NOT PER SEAT</span>
            </div>
          </div>

          <div className="ld-hero-cards">
            <div className="ld-card ld-card-gain">
              <span className="ld-mono ld-faint">SKILL GAIN · PRE TO POST</span>
              <span className="ld-gain">
                +31<span className="ld-gain-unit">pts</span>
              </span>
              <div className="ld-bars" aria-hidden="true">
                {SKILL_BARS.map((h, i) => (
                  <span
                    key={i}
                    className={
                      i < 5 ? 'ld-bar' : i < 8 ? 'ld-bar ld-bar-sky' : 'ld-bar ld-bar-orange'
                    }
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <span className="ld-small ld-faint">Cohort median, sample</span>
            </div>

            <div className="ld-card ld-card-record">
              <div className="ld-row-between">
                <span className="ld-mono ld-steel">READINESS RECORD</span>
                <span className="ld-mono ld-pill">INSTRUCTOR-REVIEWED</span>
              </div>
              <div>
                <span className="ld-record-name">J. Rivera</span>
                <span className="ld-small ld-steel">Medical Assistant · Cohort 2026-C</span>
              </div>
              <div className="ld-record-stats">
                <div>
                  <strong>4.3</strong>
                  <span>Interview / 5</span>
                </div>
                <div>
                  <strong>88%</strong>
                  <span>Post-assessment</span>
                </div>
                <div>
                  <strong className="ld-orange">Ready</strong>
                  <span>Status</span>
                </div>
              </div>
              <span className="ld-small ld-steel ld-record-foot">
                Structured interview · 6 questions · recorded 14:22
              </span>
            </div>

            <div className="ld-card ld-card-export">
              <div>
                <strong>Export ready</strong>
                <span className="ld-small ld-faint">Progress documentation · 24 learners</span>
              </div>
              <span className="ld-mono ld-chip">.CSV</span>
            </div>
            <p className="ld-small ld-faint ld-hero-note">Sample records for illustration.</p>
          </div>
        </section>

        <div className="ld-wrap">
          <hr className="ld-rule" />
        </div>

        <section id="product" className="ld-wrap ld-section">
          <div className="ld-section-head">
            <h2 className="ld-h2">Every cohort ends in evidence a funder can use.</h2>
            <p className="ld-sub">
              Five steps, one record per learner. Cohorts start when you have the students, not when
              the semester does.
            </p>
          </div>
          <ol className="ld-steps">
            {STEPS.map((s) => (
              <li key={s.n} className={s.highlight ? 'ld-step ld-step-hl' : 'ld-step'}>
                <span className="ld-step-dot" aria-hidden="true" />
                <span className="ld-mono ld-step-n">{s.n}</span>
                <span className="ld-step-title">{s.title}</span>
                <span className="ld-step-body">{s.body}</span>
              </li>
            ))}
          </ol>
        </section>

        <section id="stack" className="ld-wrap ld-section">
          <div className="ld-section-head ld-ruled">
            <div>
              <p className="ld-mono ld-eyebrow">FITS YOUR STACK</p>
              <h2 className="ld-h2">
                Not another LMS. An outcomes layer your IT office and registrar can approve.
              </h2>
            </div>
            <p className="ld-sub">
              Your systems stay the systems of record. Learn Differently runs the cohort, scores the
              interview, and hands the evidence back.
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

        <section id="pricing" className="ld-dark ld-rounded-top">
          <div className="ld-wrap ld-pricing">
            <div className="ld-pricing-pitch">
              <p className="ld-mono ld-eyebrow-sky">PRICING</p>
              <h2 className="ld-h2 ld-h2-xl">
                Priced for a cohort, <span className="ld-orange">not a campus.</span>
              </h2>
              <p className="ld-sub ld-steel">
                The university stack is sold by the campus and by the seat, then needs a second tool
                to author a lesson and a third to register a non-credit learner. A 24-person cohort
                pays the campus price.
              </p>
              <div className="ld-price-box">
                <span className="ld-mono ld-steel">HOW WE PRICE</span>
                <span className="ld-price-head">
                  One flat price per cohort. Fixed before you start.
                </span>
                <ul className="ld-dots">
                  {PRICING_POINTS.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <a href="#demo" className="ld-btn ld-btn-orange">
                  Get cohort pricing
                </a>
              </div>
            </div>
            <div className="ld-pricing-compare">
              <p className="ld-mono ld-steel">HOW THE UNIVERSITY STACK IS SOLD</p>
              {UNIVERSITY_STACK.map((u, i) => (
                <div key={u.title} className="ld-compare">
                  <span className="ld-mono ld-faint">{String(i + 1).padStart(2, '0')}</span>
                  <span className="ld-compare-title">{u.title}</span>
                  <span className="ld-compare-body">{u.body}</span>
                </div>
              ))}
              <div className="ld-worth">
                <span className="ld-worth-title">What a cohort is worth to a state</span>
                <span className="ld-worth-figure">~$68,000</span>
                <span className="ld-worth-body">
                  Delaware&apos;s WIOA Adult program spent $2,846 per participant on training in
                  PY2024, about $68,000 for a cohort of 24. Miss 70/70, or your state&apos;s
                  performance bar for its provider list, and that is the cohort you lose, every
                  year. The record that keeps you listed should cost a small fraction of it.
                </span>
              </div>
              <p className="ld-mono ld-source-dark">US DOL PY2024 DELAWARE STATE REPORT</p>
            </div>
          </div>
        </section>

        <section id="rules" className="ld-dark">
          <div className="ld-wrap ld-section ld-rules">
            <div className="ld-section-head">
              <div>
                <p className="ld-mono ld-eyebrow-sky">WHY NOW</p>
                <h2 className="ld-h2">The rules changed in 2026. Training is paid on outcomes.</h2>
              </div>
              <p className="ld-sub ld-steel">
                Federal and state funders set the bar at numbers. Most providers have no system that
                produces them.
              </p>
            </div>
            <div className="ld-rule-cards">
              <article className="ld-rule-card ld-rule-pell">
                <p className="ld-mono">WORKFORCE PELL · JULY 1 2026</p>
                <p className="ld-rule-big">
                  70<span className="ld-rule-slash">/</span>70
                </p>
                <p className="ld-rule-note">
                  Short programs qualify only with a 70% completion rate and 70% of completers
                  employed in the second quarter after exit. US Department of Education final rule,
                  May 2026.
                </p>
              </article>
              <article className="ld-rule-card ld-rule-wioa">
                <p className="ld-mono ld-faint">WIOA · EVERY FUNDED PROGRAM</p>
                <p className="ld-rule-big ld-rule-big-md">6</p>
                <p className="ld-rule-label">indicators, reported quarterly</p>
                <p className="ld-rule-note ld-muted">
                  Employment after exit, earnings, credential attainment, measurable skill gains,
                  employer effectiveness.
                </p>
              </article>
              <article className="ld-rule-card ld-rule-ce">
                <p className="ld-mono">CONTINUING ED, OWN SURVEY</p>
                <p className="ld-rule-big ld-rule-big-sm">27%</p>
                <p className="ld-rule-label">have integrated systems</p>
                <p className="ld-rule-note">
                  42% not ready for Workforce Pell reporting. Modern Campus and UPCEA, 2026.
                </p>
              </article>
              <article className="ld-rule-card ld-rule-quote">
                <p className="ld-rule-quote-text">
                  Delaware&apos;s own PY2024 report ties a missed credential target to
                  &ldquo;reporting delays with education partners.&rdquo;
                </p>
                <p className="ld-mono ld-steel">DELAWARE WIOA ANNUAL NARRATIVE, PY24</p>
              </article>
            </div>
          </div>
        </section>

        <section id="filter" className="ld-paper ld-rounded-top ld-overlap">
          <div className="ld-wrap ld-filter">
            <div className="ld-filter-copy">
              <p className="ld-mono ld-eyebrow">THE GAP</p>
              <h2 className="ld-h2">
                Employers dropped the degree filter. Your completers need a signal.
              </h2>
              <p className="ld-sub">
                Seven in ten employers now say they hire for skills. Yet when researchers followed
                the hires, dropping the degree requirement changed about one in 700 of them, because
                nothing replaced the filter. Employers say they value non-degree credentials and
                cannot tell which ones mean ready. A scored, recorded interview against the role is
                a signal an employer can watch.
              </p>
              <p className="ld-mono ld-faint">
                NACE 2026 · BURNING GLASS INSTITUTE AND HARVARD BUSINESS SCHOOL, 2024 · SHRM, 2022
              </p>
            </div>
            <div className="ld-filter-stats">
              <div className="ld-stat ld-stat-dark">
                <span className="ld-stat-figure ld-orange">1 in 700</span>
                <span>hires that changed when employers dropped the degree requirement</span>
              </div>
              <div className="ld-stat">
                <span className="ld-stat-figure">90%</span>
                <span>
                  of HR professionals say alternative credentials add value, and cite unclear
                  quality as the reason they do not act on them
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="evidence" className="ld-wrap ld-section">
          <div className="ld-section-head ld-ruled">
            <div>
              <p className="ld-mono ld-eyebrow">EVIDENCE</p>
              <h2 className="ld-h2">Show the receipts.</h2>
            </div>
            <p className="ld-sub">
              Every learner finishes with a scored, recorded, structured interview against the role
              they trained for. That record is the outcome.
            </p>
          </div>
          <div className="ld-evidence">
            {EVIDENCE.map((e) => (
              <article key={e.source} className="ld-evidence-item">
                <p className={e.accent ? 'ld-evidence-figure ld-orange' : 'ld-evidence-figure'}>
                  {e.figure}
                </p>
                <p className="ld-evidence-claim">{e.claim}</p>
                <p className="ld-evidence-body">{e.body}</p>
                <p className="ld-mono ld-faint ld-evidence-source">{e.source}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="who" className="ld-wrap ld-section">
          <div className="ld-who-head">
            <h2 className="ld-h2 ld-h2-sm">Built for the people who have to report.</h2>
            <p className="ld-mono ld-eyebrow">WHO IT&apos;S FOR</p>
          </div>
          <div className="ld-audiences">
            {AUDIENCES.map((a, i) => (
              <article key={a.title} className="ld-audience">
                <span className="ld-mono ld-faint">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="ld-h3 ld-h3-lg">{a.title}</h3>
                <p>{a.body}</p>
                <a href="#demo" className="ld-audience-link">
                  {a.cta} <span aria-hidden="true">→</span>
                </a>
              </article>
            ))}
          </div>
        </section>

        <section id="demo" className="ld-cta ld-rounded-top">
          <div className="ld-wrap ld-cta-inner">
            <h2 className="ld-cta-title">See a cohort run end to end.</h2>
            <div className="ld-cta-row">
              <p className="ld-cta-sub">
                Thirty minutes. Bring your reporting template and we will fill it from a sample
                cohort.
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
                <span>Priced for a cohort, not a campus.</span>
                <span className="ld-mono">learndifferently.tech</span>
              </div>
              <nav aria-label="Footer" className="ld-footer-links">
                <a href="#pricing">Pricing</a>
                <a href="#evidence">Evidence and sources</a>
                <a href="#stack">Security</a>
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
