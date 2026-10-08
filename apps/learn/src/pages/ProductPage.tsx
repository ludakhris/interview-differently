import { CONTACT_EMAIL } from '../contact'
import { PRODUCTS, productPagePath } from '../products'
import { NotFoundPage } from './NotFoundPage'
import { SimpleShell } from './SimpleShell'

/** One page per product, built from the registry so the menu, homepage and page agree. */
export function ProductPage({ id }: { id: string }) {
  const index = PRODUCTS.findIndex((p) => p.id === id)
  if (index < 0) return <NotFoundPage />
  const p = PRODUCTS[index]
  const open = p.status === 'available' && p.href
  const prev = PRODUCTS[(index + PRODUCTS.length - 1) % PRODUCTS.length]
  const next = PRODUCTS[(index + 1) % PRODUCTS.length]
  return (
    <SimpleShell>
      <div className="ld-product-head">
        <p className="ld-mono ld-eyebrow">
          {String(index + 1).padStart(2, '0')} · {p.role.toUpperCase()} · {p.name.toUpperCase()}
        </p>
        <h1 className="ld-h2">{p.headline}</h1>
        <p className="ld-sub">{p.pitch}</p>
        <div className="ld-product-actions">
          {open ? (
            <a
              className="ld-btn ld-btn-orange"
              href={p.href}
              {...(p.external ? { rel: 'noopener' } : {})}
            >
              Open {p.name}
            </a>
          ) : (
            <span className="ld-piece-status">Coming soon</span>
          )}
          <a className="ld-btn ld-btn-outline" href="/#demo">
            Book a walkthrough
          </a>
        </div>
      </div>
      <aside className="ld-product-learner">
        <span className="ld-mono ld-steel">FOR LEARNERS</span>
        <p>{p.forLearners}</p>
      </aside>
      <div className="ld-tiles ld-tiles-2">
        {p.features.map((f) => (
          <article key={f.title} className="ld-tile">
            <h3 className="ld-h3">{f.title}</h3>
            <p>{f.body}</p>
          </article>
        ))}
      </div>
      {!open && (
        <p className="ld-sub">
          To hear when it is ready, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      )}
      <nav className="ld-product-nav" aria-label="Other pieces">
        <a href={productPagePath(prev)}>
          <span aria-hidden="true">←</span> {prev.name}
        </a>
        <a href="/#platform">How the five fit together</a>
        <a href={productPagePath(next)}>
          {next.name} <span aria-hidden="true">→</span>
        </a>
      </nav>
    </SimpleShell>
  )
}
