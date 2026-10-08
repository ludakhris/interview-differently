import { CONTACT_EMAIL } from '../contact'
import { PRODUCTS, productPagePath } from '../products'
import { COMPONENTS } from './home/content'
import { NotFoundPage } from './NotFoundPage'
import { SimpleShell } from './SimpleShell'
import './home/home-sections.css'

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="m5 12.5 4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * One page per component, built from the registry so the menu, homepage and page agree. It
 * speaks the homepage's language: what the team does by hand today, what this component does
 * instead, and where it sits among the five.
 */
export function ProductPage({ id }: { id: string }) {
  const index = PRODUCTS.findIndex((p) => p.id === id)
  if (index < 0) return <NotFoundPage />
  const p = PRODUCTS[index]
  const c = COMPONENTS[index]
  const open = p.status === 'available' && p.href
  return (
    <SimpleShell>
      <div className="pp-hero">
        <div className="pp-hero-copy">
          <p className="ld-mono ld-eyebrow">
            COMPONENT {index + 1} OF 5 · {p.role.toUpperCase()}
          </p>
          <h1 className="ld-hero-title pp-title">{p.headline}</h1>
          <p className="ld-lead">{p.pitch}</p>
          <div className="ld-hero-actions">
            {open ? (
              <a
                className="ld-btn ld-btn-orange ld-btn-lg"
                href={p.href}
                {...(p.external ? { rel: 'noopener' } : {})}
              >
                Open {p.name}
              </a>
            ) : (
              <a className="ld-btn ld-btn-orange ld-btn-lg" href="/#demo">
                Book a walkthrough
              </a>
            )}
            {open && (
              <a className="ld-btn ld-btn-ink ld-btn-lg" href="/#demo">
                Book a walkthrough
              </a>
            )}
          </div>
        </div>
        <div className="pp-swap">
          <div className="pp-swap-card pp-swap-before">
            <span className="ld-mono ld-faint">BY HAND TODAY</span>
            <p>{c.manual}</p>
          </div>
          <span className="pp-swap-arrow" aria-hidden="true">
            ↓
          </span>
          <div className="pp-swap-card pp-swap-after">
            <span className="ld-mono">WITH {p.name.toUpperCase()}</span>
            <p>{c.now}</p>
          </div>
        </div>
      </div>

      <section className="pp-section">
        <h2 className="ld-h2 ld-h2-sm">What it does</h2>
        <ul className="c-measure-grid c-measure-grid-2 pp-features">
          {p.features.map((f) => (
            <li key={f.title}>
              <i aria-hidden="true">
                <CheckIcon />
              </i>
              <div>
                <strong>{f.title}</strong>
                <span className="c-measure-how">{f.body}</span>
              </div>
            </li>
          ))}
        </ul>
        <aside className="pp-learner">
          <span className="ld-mono ld-steel">FOR LEARNERS</span>
          <p>{p.forLearners}</p>
        </aside>
      </section>

      <section className="pp-section">
        <div className="pp-five-head">
          <h2 className="ld-h2 ld-h2-sm">One application, five components.</h2>
          <p className="ld-sub">
            Each one takes over a file or a tool the team keeps today and writes to the same learner
            record. <a href="/#team">See all five on the homepage →</a>
          </p>
        </div>
        <ol className="pp-five">
          {PRODUCTS.map((q, i) => (
            <li key={q.id} className={q.id === p.id ? 'pp-five-on' : undefined}>
              <a href={productPagePath(q)} aria-current={q.id === p.id ? 'page' : undefined}>
                <span className="ld-mono">
                  0{i + 1} · {q.role.toUpperCase()}
                </span>
                <strong>{q.name}</strong>
                <span className="pp-five-tag">{q.tagline}</span>
              </a>
            </li>
          ))}
        </ol>
        {!open && (
          <p className="ld-small ld-faint">
            {p.name} is in development. To hear when it is ready, email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        )}
      </section>
    </SimpleShell>
  )
}
