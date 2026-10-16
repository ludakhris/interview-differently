// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

let brand = 'learn'
vi.mock('../auth', () => ({ authConfigured: false, AccountMenu: () => null }))
vi.mock('./app-context', () => ({
  useApp: () => ({
    brand,
    tenant: 'cedar',
    fixedTenant: false,
    workspaces: [],
    current: null,
    href: (p: string) => p,
  }),
}))
vi.mock('./shared', () => ({ useRole: () => null, useWorkspaceRole: () => null }))
vi.mock('./AdminPages', () => ({ SYSTEM_ADMIN: 'system-admin' }))
vi.mock('./WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => null }))
vi.mock('./AttentionBell', () => ({ AttentionBell: () => null }))

import { DashboardShell } from './DashboardShell'

afterEach(() => {
  cleanup()
  brand = 'learn'
})

describe('DashboardShell footer', () => {
  it('ends the LearnDifferently skin with the site footer and its status badge', () => {
    render(<DashboardShell>page</DashboardShell>)
    expect(screen.getByText('Training that adapts. Admin work, automated.')).toBeTruthy()
    expect(screen.getByTitle('Learn Differently system status')).toBeTruthy()
    expect(screen.getByRole('main').nextElementSibling?.className).toBe('ld-site-footer')
  })

  it('shows no Learn Differently footer under the Delaware skin', () => {
    brand = 'delaware'
    render(<DashboardShell>page</DashboardShell>)
    expect(screen.getByText('page')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Footer' })).toBeNull()
    expect(screen.queryByTitle('Learn Differently system status')).toBeNull()
    expect(screen.queryByText('Training that adapts. Admin work, automated.')).toBeNull()
  })
})
