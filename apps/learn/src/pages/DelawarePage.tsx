import './delaware.css'

// Demonstration tenant for the Delaware Department of Labor. All providers,
// people and numbers here are fictional sample content.

const OCCUPATIONS = [
  { name: 'Medical Assistant', sector: 'Healthcare' },
  { name: 'Licensed Practical Nurse', sector: 'Healthcare' },
  { name: 'Software Developer', sector: 'Technology' },
  { name: 'Electrician', sector: 'Construction' },
  { name: 'Customer Service Representative', sector: 'Business' },
]

const CATALOG = [
  {
    sector: 'Healthcare',
    program: 'Medical Assistant',
    provider: 'Harbor Point Health Careers',
    length: '16 weeks',
    credential: 'CCMA',
  },
  {
    sector: 'Healthcare',
    program: 'Certified Nursing Assistant',
    provider: 'Tidewater Care Training Center',
    length: '6 weeks',
    credential: 'CNA',
  },
  {
    sector: 'Technology',
    program: 'IT Support Specialist',
    provider: 'Lantern Hill Tech Academy',
    length: '12 weeks',
    credential: 'CompTIA A+',
  },
  {
    sector: 'Construction',
    program: 'Electrical Pre-Apprenticeship',
    provider: 'Cedar Mill Trades Institute',
    length: '10 weeks',
    credential: 'OSHA 10',
  },
  {
    sector: 'Transportation',
    program: 'Commercial Driver Training',
    provider: 'Open Road Driver School',
    length: '4 weeks',
    credential: 'CDL Class A',
  },
]

const RECORD = [
  ['Occupation', 'Medical Assistant'],
  ['Provider', 'Harbor Point Health Careers'],
  ['Pre-assessment', '54%'],
  ['Post-assessment', '88%'],
  ['Practice interviews', '3 completed'],
]

const COHORT = [
  ['24', 'Enrolled'],
  ['22', 'Post-assessed'],
  ['19', 'Interview ready'],
  ['21', 'Completed'],
]

const ROLES = [
  {
    title: 'Job Seeker',
    body: 'Practice interviews for your target job and track your readiness.',
    href: '#practice',
  },
  {
    title: 'Student',
    body: 'Enrolled with an approved training provider? Add your cohort code to begin.',
    href: '#catalog',
  },
  {
    title: 'Training Provider',
    body: 'List one offering, run your cohort, and report progress and completions.',
    href: '#providers',
  },
  {
    title: 'Case Manager',
    body: 'See participant progress and readiness in one place, by cohort.',
    href: '#progress',
  },
]

export function DelawarePage() {
  return (
    <div className="de">
      <div className="de-proto-bar" role="note">
        <strong>Demonstration prototype</strong>
        <span>Sample content only. This is not an official State of Delaware website.</span>
        <a href="#about">About this demo</a>
      </div>

      <header className="de-header">
        <img
          src="/tenants/delaware/dol-logo.png"
          alt="Delaware Department of Labor"
          className="de-logo"
        />
        <nav aria-label="Main">
          <ul className="de-nav">
            <li>
              <a href="#practice">Practice an Interview</a>
            </li>
            <li>
              <a href="#catalog">Training Catalog</a>
            </li>
            <li>
              <a href="#progress">My Progress</a>
            </li>
            <li>
              <a href="#providers">For Providers</a>
            </li>
          </ul>
        </nav>
        <form role="search" className="de-search" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="de-q" className="de-visually-hidden">
            Search
          </label>
          <input id="de-q" type="search" placeholder="Search" />
          <button type="submit" className="de-btn">
            Go
          </button>
        </form>
      </header>

      <div className="de-titlebar">
        <div className="de-wrap de-titlebar-inner">
          <span className="de-titlebar-name">Career Readiness Tool</span>
          <span className="de-titlebar-powered">
            Powered by{' '}
            <strong>
              learn<span className="de-slash">/</span>differently
            </strong>{' '}
            · every participant&apos;s progress and outcomes in one record
          </span>
        </div>
      </div>

      <main>
        <section className="de-wrap de-hero">
          <div className="de-hero-copy">
            <h1 className="de-hero-intro">Finish training ready to be hired.</h1>
            <p className="de-hero-lead">
              Practice a real interview for a Delaware in-demand occupation, get scored feedback,
              and build a readiness record your training provider and case manager can see.
              Available to Delawareans enrolled with an approved training provider.
            </p>
            <div className="de-actions">
              <a href="#practice" className="de-btn">
                Start a Practice Interview
              </a>
              <a href="#catalog" className="de-btn de-btn-outline">
                Browse Training
              </a>
            </div>
          </div>
          <div className="de-hero-aside">
            <div className="de-record">
              <h2 className="de-card-title">Sample readiness record</h2>
              <dl className="de-record-rows">
                {RECORD.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
                <div>
                  <dt>Interview readiness</dt>
                  <dd className="de-ready">Ready to interview</dd>
                </div>
              </dl>
              <p className="de-note">
                Sample record, tracked in learn/differently. No real personal data is collected in
                this demo.
              </p>
            </div>
          </div>
        </section>

        <section id="progress" className="de-band de-band-blue">
          <div className="de-wrap de-band-grid">
            <div className="de-band-copy">
              <p className="de-kicker">Built on the learn/differently platform</p>
              <h2 className="de-h2 de-on-dark">
                Every participant&apos;s progress and outcomes, tracked from enrollment to
                completion
              </h2>
              <p>
                This tool runs on learn/differently, the Learn Differently outcomes platform. Each
                participant has one record: enrollment, pre and post assessment scores, practice
                interview attempts, and completion. Providers and case managers see it by cohort.
                The Division of Employment and Training receives completion and skill-gain records
                in the format Delaware JobLink reporting expects.
              </p>
              <a href="#providers" className="de-btn de-btn-white">
                For Training Providers
              </a>
            </div>
            <div className="de-dashboard">
              <h3 className="de-card-title">Sample cohort dashboard</h3>
              <div className="de-dashboard-stats">
                {COHORT.map(([n, label]) => (
                  <div key={label}>
                    <span className="de-stat-n">{n}</span>
                    <span className="de-stat-label">{label}</span>
                  </div>
                ))}
              </div>
              <p className="de-note">Sample numbers for illustration.</p>
            </div>
          </div>
        </section>

        <section className="de-wrap de-section">
          <h2 className="de-h2">I am a</h2>
          <div className="de-roles">
            {ROLES.map((r) => (
              <article key={r.title} className="de-role">
                <h3 className="de-h3">{r.title}</h3>
                <p>{r.body}</p>
                <a href={r.href}>Learn More</a>
              </article>
            ))}
          </div>
        </section>

        <section id="practice" className="de-band de-band-navy">
          <div className="de-wrap de-band-grid">
            <div className="de-band-copy">
              <h2 className="de-h2 de-on-dark">
                Practice an interview for a Delaware in-demand job
              </h2>
              <p>
                Choose an occupation from the 2026 High Demand Occupation List. Answer questions out
                loud or by typing, get scored feedback on each answer, and try again. Your best
                attempt goes on your readiness record.
              </p>
              <a href="#practice" className="de-btn de-btn-white">
                Start a Practice Interview
              </a>
            </div>
            <ul className="de-occupations">
              {OCCUPATIONS.map((o) => (
                <li key={o.name}>
                  <span>{o.name}</span>
                  <span className="de-occupation-sector">{o.sector}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="catalog" className="de-wrap de-section">
          <h2 className="de-h2">Training Catalog</h2>
          <p className="de-intro">
            One offering from each training provider on Delaware&apos;s Eligible Training Provider
            List. Sample entries shown, with fictional providers; the live catalog is filled from
            the list published September 24, 2026.
          </p>
          <div className="de-catalog">
            {CATALOG.map((c) => (
              <article key={c.program} className="de-offering">
                <p className="de-sector">{c.sector}</p>
                <h3 className="de-h3">{c.program}</h3>
                <p className="de-offering-meta">
                  {c.provider} · {c.length} · Credential: {c.credential}
                </p>
                <a href="#catalog">View Offering</a>
              </article>
            ))}
            <article className="de-offering de-offering-more">
              <p className="de-card-title">More providers</p>
              <a href="#catalog">See the Full Catalog</a>
            </article>
          </div>
        </section>

        <section id="providers" className="de-wrap de-section">
          <h2 className="de-h2">For Training Providers</h2>
          <p className="de-intro">
            Approved providers add one offering, invite a cohort, and add short lessons with
            knowledge checks, or upload existing content in minutes. There is no course packaging
            step and no per-seat license.
          </p>
          <a href="#providers" className="de-btn">
            Request Provider Access
          </a>
        </section>
      </main>

      <footer className="de-footer">
        <div className="de-wrap de-footer-grid">
          <div>
            <p className="de-footer-head">Career Readiness Tool</p>
            <p>
              A demonstration built for the Delaware Department of Labor, Division of Employment and
              Training. Sample content only.
            </p>
          </div>
          <div>
            <p className="de-footer-head">Resources</p>
            <a href="#catalog">Eligible Training Provider List</a>
            <a href="#practice">2026 High Demand Occupation List</a>
            <a href="#progress">Delaware JobLink</a>
          </div>
          <div>
            <p className="de-footer-head">About this demo</p>
            <p id="about">
              Built on the <strong>learn/differently</strong> platform (learndifferently.online).
              Participant progress and outcomes are tracked there and reported to the Division of
              Employment and Training. No real personal data is collected in this demo.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
