// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let role = 'case-manager'
const ws = () => ({
  id: 'p',
  name: 'Cedar Mill',
  kind: 'provider',
  subdomain: 'cedar',
  parentId: null,
  featuredDemo: false,
  role,
})
vi.mock('../auth', () => ({ authConfigured: true }))
vi.mock('@clerk/clerk-react', () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true }) }))
vi.mock('./app-context', () => ({
  AppProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  WorkspacesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useApp: () => ({
    tenant: 'cedar',
    query: '',
    workspaces: [ws()],
    workspacesError: null,
    current: ws(),
    href: (p: string) => p,
  }),
}))
vi.mock('./shared', () => ({
  errorNotice: () => null,
  useWorkspaceRole: () => role,
  useRole: () => role,
}))
vi.mock('./DashboardShell', () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Notice: ({ title }: { title: string }) => <p>{title}</p>,
}))
vi.mock('./OutcomesPage', () => ({ OutcomesPage: () => <p>OutcomesPage</p> }))
vi.mock('./GradebookPage', () => ({ GradebookPage: () => <p>GradebookPage</p> }))
vi.mock('./CohortsPage', () => ({ CohortsPage: () => <p>CohortsPage</p> }))
vi.mock('./CoursesPage', () => ({ CoursesPage: () => <p>CoursesPage</p> }))
vi.mock('./MembersPage', () => ({ MembersPage: () => <p>MembersPage</p> }))
vi.mock('./AdminPages', () => ({ AdminPage: () => null, AdminUsersPage: () => null }))
vi.mock('./activity/ActivityPage', () => ({ ActivityPage: () => <p>ActivityPage</p> }))

import { DashboardApp } from './DashboardApp'

const replace = vi.fn()
beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, replace, search: '' },
    writable: true,
  })
})
afterEach(() => {
  cleanup()
  replace.mockReset()
})

const open = (pathname: string, as: string) => {
  role = as
  return render(
    <DashboardApp
      context={{ tenant: 'cedar', fixedTenant: false, brand: 'learn', query: '' }}
      pathname={pathname}
      search=""
    />
  )
}

describe('staff routes by role', () => {
  it('sends an instructor from the outcomes page to cohorts, and keeps the gradebook open', () => {
    open('/lms/dashboard', 'instructor')
    expect(replace).toHaveBeenCalledWith('/lms/cohorts')
    cleanup()
    open('/lms/dashboard/cohorts/c1', 'instructor')
    expect(screen.getByText('GradebookPage')).toBeTruthy()
  })

  it('shows a case manager outcomes and the gradebook, but not cohorts, courses or people', () => {
    open('/lms/dashboard', 'case-manager')
    expect(screen.getByText('OutcomesPage')).toBeTruthy()
    for (const path of ['/lms/cohorts', '/lms/courses', '/lms/members']) {
      cleanup()
      open(path, 'case-manager')
      expect(screen.getByText('Page not found')).toBeTruthy()
    }
    expect(replace).not.toHaveBeenCalled()
  })

  it('keeps an instructor out of courses, people and talent, but lets them into cohorts', () => {
    for (const path of ['/lms/courses', '/lms/members', '/lms/talent']) {
      cleanup()
      open(path, 'instructor')
      expect(screen.getByText('Page not found')).toBeTruthy()
    }
    cleanup()
    open('/lms/cohorts', 'instructor')
    expect(screen.getByText('CohortsPage')).toBeTruthy()
  })

  it('sends people to a page they may open when no page is named', () => {
    open('/lms/other', 'provider-admin')
    expect(replace).toHaveBeenCalledWith('/lms/courses')
    replace.mockReset()
    cleanup()
    open('/lms/other', 'instructor')
    expect(replace).toHaveBeenCalledWith('/lms/cohorts')
  })

  it('opens the staff page for an admin', () => {
    open('/lms/members', 'provider-admin')
    expect(screen.getByText('MembersPage')).toBeTruthy()
  })
})
