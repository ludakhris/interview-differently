import { useAuth } from '@clerk/clerk-react'
import { authConfigured } from '../auth'
import type { AppContext } from '../brand'
import { ActivityHeartbeat } from './activity/ActivityHeartbeat'
import { ActivityPage } from './activity/ActivityPage'
import { AdminPage, AdminUsersPage } from './AdminPages'
import { AppProvider, useApp, WorkspacesProvider } from './app-context'
import { CohortPage } from './CohortPage'
import { CohortsPage } from './CohortsPage'
import { CourseEditorPage } from './CourseEditorPage'
import { CoursesPage } from './CoursesPage'
import { DashboardShell, Notice } from './DashboardShell'
import { GradebookPage } from './GradebookPage'
import { LearningCoursePage } from './LearningCoursePage'
import { LearningItemPage } from './LearningItemPage'
import { LearningPage } from './LearningPage'
import { canSeeActivity, canSeeTalent } from './roleAccess'
import { LearnerOutcomesPage } from './outcomes/LearnerOutcomesPage'
import { OutcomesPage } from './OutcomesPage'
import { errorNotice, useRole } from './shared'
import { LearnerRecordPage } from './learnerRecord/LearnerRecordPage'
import { MyProfilePage } from './talent/MyProfilePage'
import { TalentPage } from './talent/TalentPage'
import { SupportQueuePage } from './talent/SupportQueuePage'
import { TalentParticipantPage } from './talent/TalentParticipantPage'
import { ToolsPage } from './ToolsPage'
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
  const { query } = useApp()
  if (isLoaded && !isSignedIn) {
    // Come back to the same page after signing in, and keep the same skin on the way.
    const skin = query ? `&${query.slice(1)}` : ''
    window.location.replace(`/sign-in?redirect_url=${encodeURIComponent(pathname + search)}${skin}`)
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
  const role = useRole()
  // Learner pages need no workspace: any signed-in LearnDifferently account can use them.
  const learnerItem = /^\/lms\/learning\/([^/]+)\/([^/]+)\/?$/.exec(pathname)
  const learnerCourse = /^\/lms\/learning\/([^/]+)\/?$/.exec(pathname)
  const learnerOutcomes = /^\/lms\/learning\/outcomes\/?$/.test(pathname)
  const learnerProfile = /^\/lms\/learning\/profile\/?$/.test(pathname)
  if (pathname === '/lms/learning' || pathname.startsWith('/lms/learning/')) {
    return (
      <DashboardShell>
        <ActivityHeartbeat pathname={pathname} />
        {learnerOutcomes ? (
          <LearnerOutcomesPage />
        ) : learnerProfile ? (
          <MyProfilePage />
        ) : learnerItem ? (
          <LearningItemPage
            cohortId={decodeURIComponent(learnerItem[1])}
            itemId={decodeURIComponent(learnerItem[2])}
          />
        ) : learnerCourse ? (
          <LearningCoursePage cohortId={decodeURIComponent(learnerCourse[1])} />
        ) : (
          <LearningPage />
        )}
      </DashboardShell>
    )
  }

  // Admin tools need no workspace; the API only answers system admins.
  if (pathname === '/lms/admin' || pathname === '/lms/admin/') {
    return (
      <DashboardShell>
        <AdminPage />
      </DashboardShell>
    )
  }
  if (pathname === '/lms/admin/users' || pathname === '/lms/admin/users/') {
    return (
      <DashboardShell>
        <AdminUsersPage />
      </DashboardShell>
    )
  }
  if (pathname === '/lms/admin/tools' || pathname === '/lms/admin/tools/') {
    return (
      <DashboardShell>
        <ToolsPage />
      </DashboardShell>
    )
  }

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

  const notFound = (
    <Notice title="Page not found">
      This page is not available for your role in this workspace.
    </Notice>
  )
  const course = /^\/lms\/courses\/([^/]+)\/?$/.exec(pathname)
  const cohort = /^\/lms\/dashboard\/cohorts\/([^/]+)\/?$/.exec(pathname)
  const runCohort = /^\/lms\/cohorts\/([^/]+)\/?$/.exec(pathname)
  const learnerRecord = /^\/lms\/cohorts\/([^/]+)\/learners\/([^/]+)\/?$/.exec(pathname)
  const onCourses = pathname === '/lms/courses' || pathname.startsWith('/lms/courses/')
  const onCohorts = pathname === '/lms/cohorts' || pathname.startsWith('/lms/cohorts/')
  const talent = /^\/lms\/talent\/([^/]+)\/?$/.exec(pathname)
  const onTalent = pathname === '/lms/talent' || pathname.startsWith('/lms/talent/')
  const activity = /^\/lms\/activity(?:\/([^/]+))?\/?$/.exec(pathname)

  if (
    current.kind === 'provider' ||
    current.kind === 'organization' ||
    current.kind === 'academic'
  ) {
    const isProvider = current.kind === 'provider'
    // Providers and organizations see the results of their own cohorts too.
    if (pathname === '/lms/dashboard' || pathname.startsWith('/lms/dashboard/')) {
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
    // Staff notes, support items and talent profiles belong to a provider, so only its workspace has them.
    if (isProvider && onTalent && canSeeTalent(role)) {
      return (
        <DashboardShell>
          {/^\/lms\/talent\/support\/?$/.test(pathname) ? (
            <SupportQueuePage providerId={current.id} />
          ) : talent ? (
            <TalentParticipantPage providerId={current.id} userId={decodeURIComponent(talent[1])} />
          ) : (
            <TalentPage providerId={current.id} workspace={current.subdomain} />
          )}
        </DashboardShell>
      )
    }
    if ((onTalent && isProvider) || (activity && !canSeeActivity(role))) {
      return <DashboardShell>{notFound}</DashboardShell>
    }
    if (activity) {
      return (
        <DashboardShell>
          <ActivityPage
            workspace={current.subdomain}
            cohortId={activity[1] ? decodeURIComponent(activity[1]) : undefined}
          />
        </DashboardShell>
      )
    }
    if (learnerRecord) {
      return (
        <DashboardShell>
          {canSeeActivity(role) ? (
            <LearnerRecordPage
              cohortId={decodeURIComponent(learnerRecord[1])}
              userId={decodeURIComponent(learnerRecord[2])}
            />
          ) : (
            notFound
          )}
        </DashboardShell>
      )
    }
    if (onCohorts) {
      return (
        <DashboardShell>
          {runCohort ? (
            <CohortPage cohortId={decodeURIComponent(runCohort[1])} />
          ) : (
            <CohortsPage workspace={current.subdomain} />
          )}
        </DashboardShell>
      )
    }
    if (isProvider && onCourses) {
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
    window.location.replace(href(isProvider ? '/lms/courses' : '/lms/cohorts'))
    return null
  }

  if (current.kind === 'agency') {
    if (onTalent || activity) return <DashboardShell>{notFound}</DashboardShell>
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

  return null
}
