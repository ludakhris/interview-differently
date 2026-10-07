// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const send = vi.fn()
const loads: Record<string, unknown> = {}
vi.mock('./api', () => ({
  useApiSend: () => send,
  useApiFetch: () => vi.fn(),
  useLoad: (path: string) => ({
    data: loads[path] ?? null,
    error: null,
    loading: false,
    reload: vi.fn(),
  }),
}))
vi.mock('./app-context', () => ({ useApp: () => ({ href: (p: string) => p }) }))

import { CohortPage } from './CohortPage'
import { LearningCoursePage } from './LearningCoursePage'

afterEach(() => {
  cleanup()
  send.mockReset()
  for (const k of Object.keys(loads)) delete loads[k]
})

const cohort = {
  id: 'c1',
  name: 'Fall',
  courseId: 'k1',
  courseTitle: 'Data Analysis',
  status: 'upcoming',
  startsAt: '2026-11-01T00:00:00Z',
  endsAt: '2026-12-01T00:00:00Z',
  joinKey: 'ABC',
  maxLearners: null,
  enrolled: 0,
  lengthWeeks: 4,
  roster: [],
  requiresApproval: false,
  joinContact: null,
  delivery: 'online',
  requiresProfile: false,
  profileRefreshMonths: null,
}

describe('cohort details: profile requirement', () => {
  it('shows the refresh choice only when the profile is required, and saves both', async () => {
    loads['/learn/cohorts/c1'] = cohort
    loads['/learn/cohorts/c1/join-requests'] = []
    send.mockResolvedValue(cohort)
    render(<CohortPage cohortId="c1" />)
    expect(screen.queryByLabelText('Ask learners to refresh it')).toBeNull()
    await userEvent.click(screen.getByLabelText(/Learners must complete their profile first/))
    expect(
      screen.getByText('Learners choose whether your organization can read their profile.')
    ).toBeTruthy()
    const select = screen.getByLabelText('Ask learners to refresh it') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['', '3', '6', '12'])
    expect(select.options[0].textContent).toBe('Never')
    await userEvent.selectOptions(select, '6')
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }))
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        'PUT',
        '/learn/cohorts/c1',
        expect.objectContaining({ requiresProfile: true, profileRefreshMonths: 6 })
      )
    )
  })
  it('sends null for the period when the requirement is off', async () => {
    loads['/learn/cohorts/c1'] = { ...cohort, requiresProfile: true, profileRefreshMonths: 12 }
    loads['/learn/cohorts/c1/join-requests'] = []
    send.mockResolvedValue(cohort)
    render(<CohortPage cohortId="c1" />)
    expect((screen.getByLabelText('Ask learners to refresh it') as HTMLSelectElement).value).toBe(
      '12'
    )
    await userEvent.click(screen.getByLabelText(/Learners must complete their profile first/))
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }))
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        'PUT',
        '/learn/cohorts/c1',
        expect.objectContaining({ requiresProfile: false, profileRefreshMonths: null })
      )
    )
  })
})

describe('learner course page', () => {
  it('lists Your profile first with its note', () => {
    loads['/learn/me/cohorts/c1'] = {
      cohort: {
        cohortId: 'c1',
        cohortName: 'Fall',
        courseTitle: 'Data Analysis',
        host: 'DSU',
        status: 'active',
        startsAt: '2026-10-01T00:00:00Z',
        endsAt: '2026-12-01T00:00:00Z',
        enrollmentStatus: 'enrolled',
        itemsDone: 0,
        itemsTotal: 2,
      },
      modules: [
        {
          id: 'm0',
          title: 'Your profile',
          items: [
            {
              id: 'profile',
              type: 'profile',
              title: 'Your profile',
              label: null,
              status: 'in_progress',
              score: null,
              attempts: 0,
              note: 'Finish your profile',
            },
          ],
        },
        { id: 'm1', title: 'Basics', items: [] },
      ],
      added: [],
      record: {},
    }
    render(<LearningCoursePage cohortId="c1" />)
    const first = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('Finish'))
    expect(first?.textContent).toMatch(/Your profile.*Finish your profile/)
    expect(screen.getAllByRole('heading', { level: 3 })[0].textContent).toBe('Your profile')
  })
})
