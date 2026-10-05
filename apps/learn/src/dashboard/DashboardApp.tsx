import { useAuth } from '@clerk/clerk-react'
import { authConfigured } from '../auth'
import type { AppContext } from '../brand'
import { AppProvider } from './app-context'
import { DashboardShell, Notice } from './DashboardShell'
import { GradebookPage } from './GradebookPage'
import { OutcomesPage } from './OutcomesPage'
import { WorkspaceChooser } from './WorkspaceChooser'

/** Signed-in reporting views: /dashboard and /dashboard/cohorts/:id. */
export function DashboardApp({
  context,
  pathname,
  search,
}: {
  context: AppContext
  pathname: string
  search: string
}) {
  return (
    <AppProvider value={context}>
      {authConfigured ? (
        <Gate tenant={context.tenant} pathname={pathname} search={search} />
      ) : (
        <DashboardShell>
          <Notice title="Sign-in is not configured">
            Set VITE_CLERK_PUBLISHABLE_KEY for this deployment to view reports.
          </Notice>
        </DashboardShell>
      )}
    </AppProvider>
  )
}

function Gate({
  tenant,
  pathname,
  search,
}: {
  tenant: string | null
  pathname: string
  search: string
}) {
  const { isLoaded, isSignedIn } = useAuth()
  if (isLoaded && !isSignedIn) {
    // Come back to the same page, in the same skin, after signing in.
    window.location.replace(`/sign-in?redirect_url=${encodeURIComponent(pathname + search)}`)
    return null
  }
  if (!isLoaded) return null
  if (!tenant) return <WorkspaceChooser />
  const cohort = /^\/dashboard\/cohorts\/([^/]+)\/?$/.exec(pathname)
  return (
    <DashboardShell>
      {cohort ? (
        <GradebookPage tenant={tenant} cohortId={decodeURIComponent(cohort[1])} />
      ) : (
        <OutcomesPage tenant={tenant} />
      )}
    </DashboardShell>
  )
}
