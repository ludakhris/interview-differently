// @vitest-environment jsdom
import type { ComplianceFramework } from '@id/types'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

let role: string | undefined = 'admin'
let loaded: { data: ComplianceFramework[] | null; error: Error | null } = {
  data: null,
  error: null,
}
const paths: string[] = []
vi.mock('./api', () => ({
  useLoad: (path: string) => {
    paths.push(path)
    return { ...loaded, loading: !loaded.data && !loaded.error, reload: vi.fn() }
  },
  useApiSend: () => vi.fn(),
}))
vi.mock('./app-context', () => ({ useApp: () => ({ href: (p: string) => p }) }))
vi.mock('./shared', () => ({
  errorNotice: (e: Error) => <p>Error: {e.message}</p>,
  useRole: () => role,
}))
vi.mock('./AdminPages', () => ({ SYSTEM_ADMIN: 'admin' }))

import { CompliancePage } from './CompliancePage'

const framework: ComplianceFramework = {
  key: 'example',
  name: 'Example State IT',
  importedAt: '2026-10-19T00:00:00Z',
  requirements: [
    {
      code: 'AC-1',
      area: 'Access',
      requirement: 'Multi-factor sign-in',
      strength: 'MUST',
      source: 'Policy 1',
      status: 'partial',
      standing: 'Optional for staff.',
      plan: 'Require it for staff roles.',
      issue: 99,
    },
    {
      code: 'AC-2',
      area: 'Access',
      requirement: 'Password length',
      strength: 'SHOULD',
      source: 'Policy 2',
      status: 'not_applicable',
      standing: 'We store no passwords.',
      plan: null,
      issue: null,
    },
    {
      code: 'LG-1',
      area: 'Logging',
      requirement: 'Central logging',
      strength: 'MUST',
      source: 'Policy 3',
      status: 'not_satisfied',
      standing: 'Logs stay with the host.',
      plan: 'Add a log drain.',
      issue: null,
    },
  ],
}

afterEach(() => {
  cleanup()
  paths.length = 0
  role = 'admin'
  loaded = { data: null, error: null }
})

describe('CompliancePage', () => {
  it('is closed to everyone but platform administrators, and asks the API nothing', () => {
    role = 'agency-admin'
    render(<CompliancePage />)
    expect(screen.getByText('Your account does not have access')).toBeTruthy()
    expect(paths).toEqual([])
  })

  it('counts each status and shows where we stand and how we get there', () => {
    loaded = { data: [framework], error: null }
    render(<CompliancePage />)
    expect(paths).toEqual(['/learn/admin/compliance'])
    expect(screen.getByRole('tab', { name: 'Example State IT' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Partly satisfied\s*1/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Not applicable\s*1/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Tracked in #99' }).getAttribute('href')).toBe(
      'https://github.com/ludakhris/interview-differently/issues/99'
    )
    expect(screen.getByText('Why it does not apply')).toBeTruthy()
    expect(screen.getByText('0 of 1 satisfied · 1 not applicable')).toBeTruthy()
  })

  it('filters by status and by search', () => {
    loaded = { data: [framework], error: null }
    render(<CompliancePage />)
    fireEvent.click(screen.getByRole('button', { name: /Not satisfied\s*1/ }))
    expect(screen.getByText('Showing 1 of 3')).toBeTruthy()
    expect(screen.queryByText('Multi-factor sign-in')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Not satisfied\s*1/ }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'password' } })
    expect(screen.getByText('Showing 1 of 3')).toBeTruthy()
    expect(screen.getByText('Password length')).toBeTruthy()
  })

  it('invites an import when nothing has been imported yet', () => {
    loaded = { data: [], error: null }
    render(<CompliancePage />)
    expect(screen.getByText(/No requirements yet/)).toBeTruthy()
    expect(screen.getByText('Import requirements')).toBeTruthy()
  })
})
