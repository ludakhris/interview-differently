import type { ReactNode } from 'react'
import { AccountMenu, type MenuGroup, type MenuLink } from '../auth'
import { NavDropdown } from '../components/NavDropdown'
import { ProductsMenu } from '../components/ProductsMenu'
import { withBrand } from '../brand'
import '../pages/delaware.css'
import '../pages/home.css'
import './dashboard.css'
import { SYSTEM_ADMIN } from './AdminPages'
import { useApp } from './app-context'
import { DelawareSkinPromo } from './DelawareSkinPromo'
import { buildNav } from './navModel'
import { canSeeActivity, canSeeTalent } from './roleAccess'
import { useRole } from './shared'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

// Two skins, one set of parts. Only the header markup (logo, prototype bar,
// title bar) is skin-specific. Navigation, the account menu, the workspace bar,
// the footer and every page inside are shared, so the two cannot drift.

/** The app's navigation, defined once for both skins and the account menu. */
function useNav(): MenuLink[] {
  const { href } = useApp()
  const nav = useWorkspaceNav()
  // System admins always get the Admin toolbox.
  return useRole() === SYSTEM_ADMIN ? [...nav, { label: 'Admin', href: href('/lms/admin') }] : nav
}

function useWorkspaceNav(): MenuLink[] {
  const { href, tenant, current } = useApp()
  const role = useRole()
  if (window.location.pathname.startsWith('/lms/catalog')) {
    return [
      { label: 'Training catalog', href: href('/lms/catalog') },
      { label: 'My learning', href: href('/lms/learning') },
    ]
  }
  if (window.location.pathname.startsWith('/lms/learning')) {
    return [
      { label: 'My learning', href: href('/lms/learning') },
      { label: 'My outcomes', href: href('/lms/learning/outcomes') },
      { label: 'My profile', href: href('/lms/learning/profile') },
    ]
  }
  if (current?.kind === 'provider') {
    return [
      { label: 'Courses', href: href('/lms/courses') },
      { label: 'Cohorts', href: href('/lms/cohorts') },
      ...(canSeeTalent(role)
        ? [
            { label: 'Talent', href: href('/lms/talent') },
            { label: 'Support', href: href('/lms/talent/support') },
          ]
        : []),
      ...(canSeeActivity(role) ? [{ label: 'Activity', href: href('/lms/activity') }] : []),
      { label: 'Outcomes', href: href('/lms/dashboard') },
    ]
  }
  if (current?.kind === 'organization' || current?.kind === 'academic') {
    return [
      { label: 'Cohorts', href: href('/lms/cohorts') },
      ...(canSeeActivity(role) ? [{ label: 'Activity', href: href('/lms/activity') }] : []),
      { label: 'Outcomes', href: href('/lms/dashboard') },
    ]
  }
  if (current?.kind === 'agency') {
    return [
      { label: 'Outcomes dashboard', href: href('/lms/dashboard') },
      ...(tenant === 'delaware' ? [{ label: 'Career Readiness Tool', href: href('/') }] : []),
    ]
  }
  return []
}

function NavLinks({ className, leading }: { className: string; leading?: ReactNode }) {
  return (
    <ul className={className}>
      {leading && <li>{leading}</li>}
      {useNav().map((l) => (
        <li key={l.label}>
          <a href={l.href}>{l.label}</a>
        </li>
      ))}
    </ul>
  )
}

/** What the navigation offers this person, from the workspaces and learning they have. */
function useNavModel() {
  const { href, workspaces, current } = useApp()
  const role = useRole()
  const params = new URLSearchParams(window.location.search)
  params.delete('site')
  const query = params.toString()
  return buildNav({
    role,
    workspaces,
    current,
    pathname: window.location.pathname,
    href,
    workspacesHref: `/lms/dashboard${query ? `?${query}` : ''}`,
  })
}

/** Avatar menu: the person's learner and staff links, then Sign out. */
function AccountControl() {
  const { fixedTenant } = useApp()
  const model = useNavModel()
  const flat = useNav()
  // A tenant host fixes the workspace and keeps the older flat list.
  if (fixedTenant) return <AccountMenu signedOut={null} links={flat} />
  const groups: MenuGroup[] = [
    ...(model.account.learner ? [{ heading: "I'm a learner", links: model.account.learner }] : []),
    ...(model.account.staff ? [{ heading: "I'm a staff member", links: model.account.staff }] : []),
  ]
  return <AccountMenu signedOut={null} groups={groups.length > 0 ? groups : undefined} />
}

/** Top bar of the LearnDifferently skin: Products, then the learner and staff menus the person has. */
function LearnNav({ productsMenu }: { productsMenu: ReactNode }) {
  const model = useNavModel()
  const onCatalog = window.location.pathname.startsWith('/lms/catalog')
  const { href } = useApp()
  return (
    <ul className="ld-nav">
      <li>{productsMenu}</li>
      {model.learner && (
        <li>
          <NavDropdown
            label="Learner tools"
            items={[
              ...(onCatalog ? [{ label: 'Training catalog', href: href('/lms/catalog') }] : []),
              ...model.learner,
            ]}
          />
        </li>
      )}
      {model.staff && (
        <li>
          <NavDropdown label="Staff tools" items={model.staff} />
        </li>
      )}
    </ul>
  )
}

/** The Delaware title bar names the area the visitor is in. */
function titleFor(pathname: string): string {
  if (pathname.startsWith('/sign-in')) return 'Sign in'
  if (pathname.startsWith('/lms/catalog')) return 'Training Catalog'
  if (pathname.startsWith('/lms/learning')) return 'My Learning'
  if (pathname.startsWith('/lms/courses')) return 'Course Setup'
  if (pathname.startsWith('/lms/cohorts')) return 'Cohorts'
  if (pathname.startsWith('/lms/talent')) return 'Talent'
  if (pathname.startsWith('/lms/activity')) return 'Activity'
  if (pathname.startsWith('/lms/admin')) return 'Admin'
  return 'Program Outcomes'
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
          <span className="de-titlebar-name">{titleFor(window.location.pathname)}</span>
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
  const { href } = useApp()
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
          <LearnNav
            productsMenu={
              <ProductsMenu
                hrefFor={(p) =>
                  p.status === 'available' && p.href
                    ? { href: p.external ? p.href : href(p.href), external: p.external }
                    : null
                }
              />
            }
          />
        </nav>
        <AccountControl />
      </header>
      <Body wrap="ld-wrap">{children}</Body>
    </div>
  )
}

/** Shared page body: workspace bar, content, skin switch. */
function Body({ wrap, children }: { wrap: string; children: ReactNode }) {
  const { brand, tenant } = useApp()
  const { pathname, search } = window.location
  // On Delaware's dashboard in the LearnDifferently look, remind people the white-labeled version exists.
  const promo = brand === 'learn' && tenant === 'delaware' && pathname.startsWith('/lms/dashboard')
  return (
    <>
      <main className={`${wrap} dash-main`}>
        {promo && <DelawareSkinPromo href={withBrand(search, pathname, 'delaware')} />}
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
