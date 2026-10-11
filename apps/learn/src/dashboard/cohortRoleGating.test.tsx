// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

let role = 'instructor'
const cohort = {
  id: 'c1',
  name: 'Fall',
  courseId: 'k1',
  courseTitle: 'Data Analysis',
  status: 'running',
  startsAt: '2026-11-01T00:00:00Z',
  endsAt: '2026-12-01T00:00:00Z',
  joinKey: null as string | null,
  maxLearners: null,
  enrolled: 1,
  lengthWeeks: 4,
  requiresApproval: true,
  joinContact: null,
  delivery: 'online',
  requiresProfile: false,
  profileRefreshMonths: null,
  roster: [
    {
      enrollmentId: 'e1',
      userId: 'u1',
      name: 'Lee Learner',
      email: 'lee@example.com',
      status: 'enrolled',
      itemsDone: 1,
      itemsTotal: 4,
      enrolledAt: '2026-11-02T00:00:00Z',
      noteSummary: null,
    },
  ],
}
vi.mock('./api', () => ({
  useApiSend: () => vi.fn(),
  useApiFetch: () => vi.fn(),
  useLoad: (path: string) => ({
    data: path === '/learn/cohorts/c1' ? cohort : path.includes('assessments') ? null : [],
    error: null,
    loading: false,
    reload: vi.fn(),
  }),
}))
vi.mock('./app-context', () => ({
  useApp: () => ({
    href: (p: string) => p,
    tenant: 'cedar',
    workspaces: [{ subdomain: 'cedar', role }],
  }),
}))

import { CohortPage } from './CohortPage'

afterEach(() => {
  cleanup()
  role = 'instructor'
  cohort.joinKey = null
})

describe('cohort page by role', () => {
  it('shows an instructor the roster without anything that changes who is in the cohort', () => {
    render(<CohortPage cohortId="c1" />)
    expect(screen.getByText('Lee Learner')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Join code' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Edit cohort configuration/ })).toBeNull()
    expect(screen.queryByText(/Waiting for approval/)).toBeNull()
    expect(screen.queryByLabelText('Add a learner by email')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Recompute' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Manage staff/ })).toBeNull()
  })

  it('gives an admin all of them', () => {
    role = 'organization-admin'
    cohort.joinKey = 'ABC'
    render(<CohortPage cohortId="c1" />)
    expect(screen.getByRole('heading', { name: 'Join code' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Edit cohort configuration/ })).toBeTruthy()
    expect(screen.getByLabelText('Add a learner by email')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Recompute' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Manage staff/ }).getAttribute('href')).toBe(
      '/lms/members?cohort=c1'
    )
  })
})
