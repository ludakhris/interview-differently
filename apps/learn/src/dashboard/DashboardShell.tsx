import { useClerk, useUser } from '@clerk/clerk-react'
import type { ReactNode } from 'react'
import '../pages/delaware.css'
import './dashboard.css'

/** Page frame for the signed-in reporting views on the Delaware tenant. */
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="de dash">
      <div className="de-proto-bar" role="note">
        <strong>Demonstration prototype</strong>
        <span>Sample content only. This is not an official State of Delaware website.</span>
      </div>
      <header className="de-header">
        <a href="/">
          <img
            src="/tenants/delaware/dol-logo.png"
            alt="Delaware Department of Labor"
            className="de-logo"
          />
        </a>
        <nav aria-label="Main">
          <ul className="de-nav">
            <li>
              <a href="/dashboard">Outcomes dashboard</a>
            </li>
            <li>
              <a href="/">Career Readiness Tool</a>
            </li>
          </ul>
        </nav>
        <Account />
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
      <main className="de-wrap dash-main">{children}</main>
    </div>
  )
}

function Account() {
  const { user } = useUser()
  const { signOut } = useClerk()
  if (!user) return <span />
  const email = user.primaryEmailAddress?.emailAddress ?? ''
  return (
    <div className="dash-account">
      <span>{email}</span>
      <button type="button" className="dash-linkbtn" onClick={() => signOut({ redirectUrl: '/' })}>
        Sign out
      </button>
    </div>
  )
}

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="dash-notice" role="status">
      <h2 className="de-h2">{title}</h2>
      <p>{children}</p>
    </div>
  )
}
