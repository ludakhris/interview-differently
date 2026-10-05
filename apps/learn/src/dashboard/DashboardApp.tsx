import { useAuth } from '@clerk/clerk-react'
import { authConfigured } from '../auth'
import type { AppContext } from '../brand'
import { AppProvider, useApp, WorkspacesProvider } from './app-context'
import { CourseEditorPage } from './CourseEditorPage'
import { CoursesPage } from './CoursesPage'
import { DashboardShell, Notice } from './DashboardShell'
import { GradebookPage } from './GradebookPage'
import { OutcomesPage } from './OutcomesPage'
import { errorNotice } from './shared'
import { WorkspaceChooser } from './WorkspaceChooser'

/** Signed-in app: agency reports (/dashboard) and provider course setup (/courses). */
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
        <Gate pathname={pathname} search={search} />
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

function Gate({ pathname, search }: { pathname: string; search: string }) {
  const { isLoaded, isSignedIn } = useAuth()
  if (isLoaded && !isSignedIn) {
    // Come back to the same page, in the same skin, after signing in.
    window.location.replace(`/sign-in?redirect_url=${encodeURIComponent(pathname + search)}`)
    return null
  }
  if (!isLoaded) return null
  return (
    <WorkspacesProvider>
      <Routes pathname={pathname} />
    </WorkspacesProvider>
  )
}

/** Picks the page by the workspace's kind: agencies report, providers set up courses. */
function Routes({ pathname }: { pathname: string }) {
  const { tenant, workspaces, workspacesError, current, href } = useApp()
  if (workspacesError) return <DashboardShell>{errorNotice(workspacesError)}</DashboardShell>
  if (!workspaces) {
    return (
      <DashboardShell>
        <p className="dash-loading">Loading…</p>
      </DashboardShell>
    )
  }
  if (!tenant) return <WorkspaceChooser />
  if (!current) {
    return (
      <DashboardShell>
        <Notice title="Your account does not have access">
          You can open the workspaces your account has been added to. Ask an administrator of this
          workspace to give you access.
        </Notice>
      </DashboardShell>
    )
  }

  const course = /^\/courses\/([^/]+)\/?$/.exec(pathname)
  const cohort = /^\/dashboard\/cohorts\/([^/]+)\/?$/.exec(pathname)
  const onCourses = pathname === '/courses' || pathname.startsWith('/courses/')

  if (current.kind === 'provider') {
    if (!onCourses) {
      window.location.replace(href('/courses'))
      return null
    }
    return (
      <DashboardShell>
        {course ? (
          <CourseEditorPage courseId={decodeURIComponent(course[1])} />
        ) : (
          <CoursesPage workspace={current.subdomain} />
        )}
      </DashboardShell>
    )
  }

  if (current.kind === 'agency') {
    if (onCourses) {
      return (
        <DashboardShell>
          <Notice title="Courses live in provider workspaces">
            Pick a provider from the workspace menu to set up its courses.
          </Notice>
        </DashboardShell>
      )
    }
    return (
      <DashboardShell>
        {cohort ? (
          <GradebookPage tenant={current.subdomain} cohortId={decodeURIComponent(cohort[1])} />
        ) : (
          <OutcomesPage tenant={current.subdomain} />
        )}
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <Notice title="Cohorts are coming next">
        This workspace will run cohorts of the courses offered to it. That part is being built.
      </Notice>
    </DashboardShell>
  )
}
