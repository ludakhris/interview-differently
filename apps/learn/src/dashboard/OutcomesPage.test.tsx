// @vitest-environment jsdom
import type { AgencyOutcomes } from '@id/types'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

let app: Record<string, unknown> = {}
vi.mock('./app-context', () => ({ useApp: () => app }))
vi.mock('./shared', () => ({ errorNotice: () => null, useRole: () => 'agency-admin' }))
vi.mock('./api', () => ({
  downloadFile: vi.fn(),
  useApiFetch: () => vi.fn(),
  useLoad: () => ({ data: null, error: null, loading: true }),
}))

import { Outcomes } from './OutcomesPage'

const measures = {
  enrolled: 10,
  completed: 8,
  completionRate: 0.8,
  avgPre: 50,
  avgPost: 80,
  avgGain: 30,
  targetRate: 0.6,
  interviewReady: 5,
  readyRate: 0.5,
}
const data = {
  agency: { id: 'a', name: 'Delaware Department of Labor' },
  asOf: '2026-10-07T12:00:00Z',
  totals: measures,
  providers: [
    {
      ...measures,
      providerId: 'p1',
      provider: 'Cedar Mill',
      program: 'Electrical',
      credential: null,
      cohorts: 1,
    },
  ],
  cohorts: [
    {
      ...measures,
      cohortId: 'c1',
      cohort: 'Electrical 2026-C',
      providerId: 'p1',
      provider: 'Cedar Mill',
      host: 'Wilmington Center',
      hostId: 'o1',
      program: 'Electrical',
      startsAt: '2026-08-30T00:00:00Z',
      endsAt: '2026-11-08T00:00:00Z',
      status: 'running',
      readinessThreshold: 70,
      targetScore: 80,
    },
  ],
  funnel: [],
} as unknown as AgencyOutcomes

const workspaces = [
  { id: 'p1', subdomain: 'cedarmill', kind: 'provider', name: 'Cedar Mill' },
  { id: 'o1', subdomain: 'wilmington', kind: 'organization', name: 'Wilmington Center' },
]

afterEach(cleanup)

describe('Outcomes links', () => {
  it('names the sections plainly and links providers, hosts and cohorts the person can open', () => {
    app = { href: (p: string) => `${p}#ctx`, workspaces, fixedTenant: false, brand: 'learn' }
    render(<Outcomes data={data} tenant="delaware" />)
    expect(screen.getByRole('heading', { name: 'Cohort performance' })).toBeTruthy()
    expect(screen.getByText(/Each row is a training provider/)).toBeTruthy()
    // Providers link to their own outcomes in all three places: both charts' rows and the group heading.
    const providerLinks = screen
      .getAllByRole('link', { name: 'Cedar Mill' })
      .map((a) => a.getAttribute('href'))
    expect(providerLinks.length).toBeGreaterThanOrEqual(4)
    expect(new Set(providerLinks)).toEqual(new Set(['/lms/dashboard?site=cedarmill']))
    expect(screen.getByRole('link', { name: 'Wilmington Center' }).getAttribute('href')).toBe(
      '/lms/dashboard?site=wilmington'
    )
    const cohortLinks = screen.getAllByRole('link', { name: /Electrical 2026-C/ })
    expect(cohortLinks.length).toBeGreaterThanOrEqual(2)
    for (const a of cohortLinks)
      expect(a.getAttribute('href')).toBe('/lms/dashboard/cohorts/c1#ctx')
  })

  it('leaves providers and hosts as plain text when the person cannot open their workspace', () => {
    app = { href: (p: string) => p, workspaces: [], fixedTenant: false, brand: 'learn' }
    render(<Outcomes data={data} tenant="delaware" />)
    expect(screen.queryByRole('link', { name: 'Cedar Mill' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Wilmington Center' })).toBeNull()
    // The gradebook is inside this workspace, so it stays a link.
    expect(screen.getAllByRole('link', { name: /Electrical 2026-C/ }).length).toBeGreaterThan(0)
  })

  it('does not link out to other workspaces on a tenant host or in the branded view', () => {
    for (const over of [{ fixedTenant: true }, { brand: 'delaware' }]) {
      cleanup()
      app = { href: (p: string) => p, workspaces, fixedTenant: false, brand: 'learn', ...over }
      render(<Outcomes data={data} tenant="delaware" />)
      expect(screen.queryByRole('link', { name: 'Cedar Mill' })).toBeNull()
      const table = screen.getAllByRole('table').at(-1) as HTMLElement
      expect(within(table).queryByRole('link', { name: 'Wilmington Center' })).toBeNull()
    }
  })
})
