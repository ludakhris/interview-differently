import { useEffect, useRef, useState } from 'react'
import './products-menu.css'
import { PRODUCTS, type Product } from '../products'

/**
 * Header menu listing the five connected products. The caller decides where each
 * one goes: the public site sends every piece to its product page, the signed-in
 * app sends available pieces to the app itself. Return null for "not a link yet".
 */
export function ProductsMenu({
  hrefFor,
}: {
  hrefFor: (p: Product) => { href: string; external?: boolean } | null
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="dash-products" ref={ref}>
      <button
        type="button"
        className="dash-products-trigger"
        aria-expanded={open}
        aria-controls="dash-products-panel"
        onClick={() => setOpen(!open)}
      >
        Products
        <span className="dash-products-caret" aria-hidden="true" />
      </button>
      {open && (
        <div id="dash-products-panel" className="dash-products-panel">
          <p className="dash-products-head">
            Everything your team does by hand today, in one application
          </p>
          <ol className="dash-products-list">
            {PRODUCTS.map((p, i) => {
              const link = hrefFor(p)
              const body = (
                <>
                  <span className="dash-products-num" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="dash-products-text">
                    <span className="dash-products-name">
                      {p.name}
                      <span className="dash-products-role">{p.role}</span>
                    </span>
                    <span className="dash-products-tag">{p.tagline}</span>
                  </span>
                  {p.status === 'soon' && <span className="dash-products-soon">Coming soon</span>}
                </>
              )
              return (
                <li key={p.id}>
                  {link ? (
                    <a
                      href={link.href}
                      {...(link.external ? { rel: 'noopener' } : {})}
                      className="dash-products-item"
                    >
                      {body}
                    </a>
                  ) : (
                    <div
                      className="dash-products-item dash-products-item-soon"
                      aria-disabled="true"
                    >
                      {body}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </div>
  )
}
