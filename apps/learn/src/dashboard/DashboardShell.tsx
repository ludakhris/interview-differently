import type { ReactNode } from 'react'
import { AccountMenu, type MenuLink } from '../auth'
import { withBrand } from '../brand'
import '../pages/delaware.css'
import '../pages/home.css'
import './dashboard.css'
import { useApp } from './app-context'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

// Two skins, one set of parts. Only the header markup (logo, prototype bar,
// title bar) is skin-specific. Navigation, the account menu, the workspace bar,
// the footer and every page inside are shared, so the two cannot drift.

/** The app's navigation, defined once for both skins and the account menu. */
function useNav(): MenuLink[] {
  const { href, tenant } = useApp()
  return [
    { label: 'Outcomes dashboard', href: href('/dashboard') },
    ...(tenant === 'delaware' ? [{ label: 'Career Readiness Tool', href: href('/') }] : []),
  ]
}

function NavLinks({ className }: { className: string }) {
  return (
    <ul className={className}>
      {useNav().map((l) => (
        <li key={l.label}>
          <a href={l.href}>{l.label}</a>
        </li>
      ))}
    </ul>
  )
}

/** Avatar menu: the app's links, plus a way back to the workspace list where it applies. */
function AccountControl() {
  const nav = useNav()
  const { fixedTenant } = useApp()
  const links = [...nav]
  if (!fixedTenant) {
    const params = new URLSearchParams(window.location.search)
    params.delete('site')
    const query = params.toString()
    links.push({ label: 'All workspaces', href: `/dashboard${query ? `?${query}` : ''}` })
  }
  return <AccountMenu signedOut={null} links={links} />
}

/** Page frame for the signed-in views, in the Delaware DoL or LearnDifferently skin. */
export function DashboardShell({ children }: { children: ReactNode }) {
  const { brand } = useApp()
  return brand === 'delaware' ? (
    <DelawareFrame>{children}</DelawareFrame>
  ) : (
    <LearnFrame>{children}</LearnFrame>
  )
}

function DelawareFrame({ children }: { children: ReactNode }) {
  const { href } = useApp()
  return (
    <div className="de dash dash-brand-delaware">
      <div className="de-proto-bar" role="note">
        <strong>Demonstration prototype</strong>
        <span>Sample content only. This is not an official State of Delaware website.</span>
      </div>
      <header className="de-header">
        <a href={href('/')}>
          <img
            src="/tenants/delaware/dol-logo.png"
            alt="Delaware Department of Labor"
            className="de-logo"
          />
        </a>
        <nav aria-label="Main">
          <NavLinks className="de-nav" />
        </nav>
        <AccountControl />
      </header>
      <div className="de-titlebar">
        <div className="de-wrap de-titlebar-inner">
          <span className="de-titlebar-name">Program Outcomes</span>
          <span className="de-titlebar-powered">
            Powered by{' '}
            <strong>
              learn<span className="de-slash">/</span>differently
            </strong>
          </span>
        </div>
      </div>
      <Body wrap="de-wrap">{children}</Body>
    </div>
  )
}

function LearnFrame({ children }: { children: ReactNode }) {
  return (
    <div className="ld dash dash-brand-learn">
      <header className="ld-wrap ld-header">
        <a href="/" className="ld-brand">
          <span className="ld-mark" aria-hidden="true" />
          <span className="ld-wordmark">
            learn<span className="ld-slash">/</span>differently
          </span>
        </a>
        <nav aria-label="Main">
          <NavLinks className="ld-nav" />
        </nav>
        <AccountControl />
      </header>
      <Body wrap="ld-wrap">{children}</Body>
    </div>
  )
}

/** Shared page body: workspace bar, content, skin switch. */
function Body({ wrap, children }: { wrap: string; children: ReactNode }) {
  return (
    <>
      <main className={`${wrap} dash-main`}>
        <WorkspaceSwitcher />
        {children}
      </main>
      <BrandSwitch />
    </>
  )
}

/** Demo aid: flip between the two skins for the same data. Only offered where both exist. */
function BrandSwitch() {
  const { brand, tenant } = useApp()
  if (tenant !== 'delaware') return null
  const { pathname, search } = window.location
  return (
    <p className="dash-switch">
      Viewing with the {brand === 'delaware' ? 'Delaware Department of Labor' : 'LearnDifferently'}{' '}
      skin.{' '}
      <a href={withBrand(search, pathname, brand === 'delaware' ? 'learn' : 'delaware')}>
        Switch to {brand === 'delaware' ? 'LearnDifferently' : 'Delaware Department of Labor'}
      </a>
    </p>
  )
}

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="dash-notice" role="status">
      <h2 className="dash-h2">{title}</h2>
      <p>{children}</p>
    </div>
  )
}
