import { CONTACT_EMAIL } from '../contact'
import { PRODUCTS } from '../products'
import { NotFoundPage } from './NotFoundPage'
import { SimpleShell } from './SimpleShell'

/**
 * Placeholder page for each of the five products, built from the registry.
 * Real product pages come later; this keeps the public menu from dead-ending.
 */
export function ProductPage({ id }: { id: string }) {
  const index = PRODUCTS.findIndex((p) => p.id === id)
  if (index < 0) return <NotFoundPage />
  const p = PRODUCTS[index]
  const open = p.status === 'available' && p.href
  return (
    <SimpleShell>
      <p className="ld-mono ld-eyebrow">
        {String(index + 1).padStart(2, '0')} · {p.role.toUpperCase()}
      </p>
      <h1 className="ld-h2">{p.name}</h1>
      <p className="ld-sub">{p.tagline}</p>
      <p className="ld-sub">
        One of five connected workforce development apps for the agentic era.
      </p>
      {open ? (
        <p>
          <a
            className="ld-btn ld-btn-ink"
            href={p.href}
            {...(p.external ? { rel: 'noopener' } : {})}
          >
            Open {p.name}
          </a>
        </p>
      ) : (
        <p className="ld-sub">
          Coming soon. To hear when it is ready, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      )}
      <p>
        <a href="/">← Back to learn/differently</a>
      </p>
    </SimpleShell>
  )
}
