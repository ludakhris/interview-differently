import { useAuth } from '@clerk/clerk-react'
import type { ReactNode } from 'react'
import { AccountMenu, authConfigured } from '../auth'
import { resolveContext } from '../brand'
import { AppProvider, WorkspacesProvider } from '../dashboard/app-context'
import { AccountControl } from '../dashboard/DashboardShell'

/**
 * The header account slot for the public site (homepage, product pages, privacy). A visitor sees
 * `signedOut`; a signed-in person gets the same menu as everywhere in the app, with their learner
 * and staff links, not just Profile and Sign out.
 */
export function SiteAccountMenu({ signedOut }: { signedOut: ReactNode }) {
  if (!authConfigured) return <>{signedOut}</>
  return <ClerkSiteAccountMenu signedOut={signedOut} />
}

function ClerkSiteAccountMenu({ signedOut }: { signedOut: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  // Most visitors are signed out, so show their links while Clerk loads, and never ask the API
  // for workspaces without a session.
  if (!isLoaded || !isSignedIn) return <AccountMenu signedOut={signedOut} />
  return (
    <AppProvider value={resolveContext(window.location.hostname, window.location.search)}>
      <WorkspacesProvider>
        <AccountControl signedOut={signedOut} />
      </WorkspacesProvider>
    </AppProvider>
  )
}
