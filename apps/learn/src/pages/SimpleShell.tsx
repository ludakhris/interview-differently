import { type ReactNode } from 'react'
import { SiteAccountMenu } from '../components/SiteAccountMenu'
import { ProductsMenu } from '../components/ProductsMenu'
import { productPagePath } from '../products'
import { CONTACT_EMAIL } from '../contact'
import './home.css'

/** Header and footer for the homepage's secondary pages (sign-in, privacy). */
export function SimpleShell({ children }: { children: ReactNode }) {
  return (
    <div className="ld ld-simple">
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
          </ul>
        </nav>
        <SiteAccountMenu signedOut={null} />
      </header>
      <main className="ld-wrap ld-simple-main">{children}</main>
      <footer className="ld-wrap ld-simple-footer">
        <a href="/">Home</a>
        <a href="/privacy">Privacy</a>
        <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
      </footer>
    </div>
  )
}
