// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

let metadata: Record<string, unknown> = {}
let workspaces: Array<{ subdomain: string; role: string }> | null = null
vi.mock('@clerk/react', () => ({ useUser: () => ({ user: { publicMetadata: metadata } }) }))
vi.mock('./app-context', () => ({ useApp: () => ({ workspaces }) }))

import { useRole, useWorkspaceRole } from './shared'

afterEach(() => {
  cleanup()
  metadata = {}
  workspaces = null
})

describe('useRole', () => {
  it('is system-admin for a platform administrator, from the account', () => {
    metadata = { role: 'system-admin' }
    workspaces = []
    expect(renderHook(() => useRole()).result.current).toBe('system-admin')
  })

  it('is the highest role held across workspaces', () => {
    workspaces = [
      { subdomain: 'a', role: 'instructor' },
      { subdomain: 'b', role: 'organization-admin' },
      { subdomain: 'c', role: 'case-manager' },
    ]
    expect(renderHook(() => useRole()).result.current).toBe('organization-admin')
  })

  it('ignores an older account-level role and waits for the workspaces', () => {
    metadata = { role: 'agency-admin' }
    expect(renderHook(() => useRole()).result.current).toBeUndefined()
    workspaces = [{ subdomain: 'a', role: 'instructor' }]
    expect(renderHook(() => useRole()).result.current).toBe('instructor')
  })
})

describe('useWorkspaceRole', () => {
  it('is the role in that one workspace', () => {
    workspaces = [
      { subdomain: 'a', role: 'instructor' },
      { subdomain: 'b', role: 'provider-admin' },
    ]
    expect(renderHook(() => useWorkspaceRole('a')).result.current).toBe('instructor')
    expect(renderHook(() => useWorkspaceRole('b')).result.current).toBe('provider-admin')
    expect(renderHook(() => useWorkspaceRole('zzz')).result.current).toBeUndefined()
    expect(renderHook(() => useWorkspaceRole(null)).result.current).toBeUndefined()
  })
})
