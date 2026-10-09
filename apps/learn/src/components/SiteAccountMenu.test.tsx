// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const auth = { isLoaded: true, isSignedIn: false }
vi.mock('@clerk/clerk-react', () => ({ useAuth: () => auth }))
vi.mock('../auth', () => ({
  authConfigured: true,
  AccountMenu: ({ signedOut }: { signedOut: React.ReactNode }) => (
    <div data-testid="plain-menu">{signedOut}</div>
  ),
}))
vi.mock('../dashboard/app-context', () => ({
  AppProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  WorkspacesProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="workspaces">{children}</div>
  ),
}))
vi.mock('../dashboard/DashboardShell', () => ({
  AccountControl: () => <div data-testid="app-menu">learner and staff links</div>,
}))

import { SiteAccountMenu } from './SiteAccountMenu'

afterEach(() => {
  cleanup()
  auth.isLoaded = true
  auth.isSignedIn = false
})

describe('SiteAccountMenu', () => {
  it('shows a visitor the sign-in links, without asking the API for anything', () => {
    render(<SiteAccountMenu signedOut={<a href="/sign-in">Sign in</a>} />)
    expect(screen.getByText('Sign in')).toBeTruthy()
    expect(screen.queryByTestId('workspaces')).toBeNull()
    expect(screen.queryByTestId('app-menu')).toBeNull()
  })

  it('shows the sign-in links while the session is still loading', () => {
    auth.isLoaded = false
    render(<SiteAccountMenu signedOut={<a href="/sign-in">Sign in</a>} />)
    expect(screen.getByText('Sign in')).toBeTruthy()
    expect(screen.queryByTestId('app-menu')).toBeNull()
  })

  it('gives a signed-in person the same menu as the app, loaded with their workspaces', () => {
    auth.isSignedIn = true
    render(<SiteAccountMenu signedOut={<a href="/sign-in">Sign in</a>} />)
    expect(screen.getByTestId('workspaces').contains(screen.getByTestId('app-menu'))).toBe(true)
    expect(screen.queryByText('Sign in')).toBeNull()
  })
})
