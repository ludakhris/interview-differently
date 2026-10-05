import { useAuth } from '@clerk/clerk-react'
import { authConfigured } from '../auth'
import { DashboardShell, Notice } from './DashboardShell'
import { GradebookPage } from './GradebookPage'
import { OutcomesPage } from './OutcomesPage'

/** Signed-in reporting views: /dashboard and /dashboard/cohorts/:id. */
export function DashboardApp({ tenant, pathname }: { tenant: string; pathname: string }) {
  if (!authConfigured) {
    return (
      <DashboardShell>
        <Notice title="Sign-in is not configured">
          Set VITE_CLERK_PUBLISHABLE_KEY for this deployment to view reports.
        </Notice>
      </DashboardShell>
    )
  }
  return <Gate tenant={tenant} pathname={pathname} />
}

function Gate({ tenant, pathname }: { tenant: string; pathname: string }) {
  const { isLoaded, isSignedIn } = useAuth()
  if (isLoaded && !isSignedIn) {
    window.location.replace(`/sign-in?redirect_url=${encodeURIComponent(pathname)}`)
    return null
  }
  if (!isLoaded) return null
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
