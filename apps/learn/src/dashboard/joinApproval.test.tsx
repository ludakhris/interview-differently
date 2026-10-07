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

import { JoinRequestList, LearningPage } from './LearningPage'
import { CohortPage, PendingRequests } from './CohortPage'
import type { LearnerJoinRequest } from './joinRequests'

afterEach(() => {
  cleanup()
  send.mockReset()
  for (const k of Object.keys(loads)) delete loads[k]
})

const req = (over: Partial<LearnerJoinRequest> = {}): LearnerJoinRequest => ({
  id: 'r1',
  cohortId: 'c1',
  cohortName: 'Fall',
  courseTitle: 'Data Analysis',
  institutionName: 'Delaware State',
  status: 'pending',
  requestedAt: '2026-10-07T12:00:00Z',
  contact: 'Pat Lee, pat@x.edu',
  ...over,
})

describe('learner side', () => {
  it('lists pending and declined requests, nothing when empty', () => {
    const { container, rerender } = render(<JoinRequestList requests={[]} />)
    expect(container.innerHTML).toBe('')
    rerender(
      <JoinRequestList
        requests={[
          req(),
          req({ id: 'r2', status: 'declined', courseTitle: 'Stats', contact: null }),
        ]}
      />
    )
    const items = screen.getAllByRole('listitem')
    expect(items[0].textContent).toBe(
      'Data Analysis · Delaware State — Waiting for approval · Contact: Pat Lee, pat@x.edu'
    )
    expect(items[1].textContent).toBe('Stats · Delaware State — Not approved')
  })

  async function joinWith(contact: string | null) {
    loads['/learn/me/learning'] = []
    loads['/learn/me/join-requests'] = []
    send.mockResolvedValue({ pending: true, request: req({ contact }) })
    render(<LearningPage />)
    await userEvent.type(screen.getByRole('textbox'), 'ABC')
    await userEvent.click(screen.getByRole('button', { name: 'Join cohort' }))
    return screen.findByRole('status')
  }

  it('shows one calm line after a request, with the contact', async () => {
    expect((await joinWith('Pat Lee, pat@x.edu')).textContent).toBe(
      'Request sent. An admin has to approve it before you can start. Questions? Pat Lee, pat@x.edu.'
    )
  })

  it('omits the contact sentence when there is none', async () => {
    expect((await joinWith(null)).textContent).toBe(
      'Request sent. An admin has to approve it before you can start.'
    )
  })
})

describe('staff side', () => {
  const pending = [
    {
      id: 'p1',
      userId: 'u1',
      name: 'Ada Lovelace',
      email: 'ada@x.edu',
      requestedAt: '2026-10-06T12:00:00Z',
    },
    {
      id: 'p2',
      userId: 'u2',
      name: 'Alan Turing',
      email: 'alan@x.edu',
      requestedAt: '2026-10-06T13:00:00Z',
    },
  ]

  it('hides the block when nothing is waiting', () => {
    loads['/learn/cohorts/c1/join-requests'] = []
    const { container } = render(<PendingRequests cohortId="c1" onApproved={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('approves: removes the row, announces, refetches the roster', async () => {
    loads['/learn/cohorts/c1/join-requests'] = pending
    send.mockResolvedValue(undefined)
    const onApproved = vi.fn()
    render(<PendingRequests cohortId="c1" onApproved={onApproved} />)
    expect(screen.getByText('Waiting for approval (2)')).toBeTruthy()
    await userEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0])
    expect(send).toHaveBeenCalledWith('POST', '/learn/join-requests/p1/approve')
    expect((await screen.findByRole('status')).textContent).toBe('Ada Lovelace approved.')
    expect(screen.getByText('Waiting for approval (1)')).toBeTruthy()
    expect(onApproved).toHaveBeenCalled()
  })

  it('declines without refetching the roster', async () => {
    loads['/learn/cohorts/c1/join-requests'] = pending
    send.mockResolvedValue(undefined)
    const onApproved = vi.fn()
    render(<PendingRequests cohortId="c1" onApproved={onApproved} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Decline' })[1])
    expect(send).toHaveBeenCalledWith('POST', '/learn/join-requests/p2/decline')
    expect((await screen.findByRole('status')).textContent).toBe('Alan Turing declined.')
    expect(onApproved).not.toHaveBeenCalled()
  })

  it('shows the full-cohort error inline and keeps the row', async () => {
    loads['/learn/cohorts/c1/join-requests'] = pending
    send.mockRejectedValue(new Error('This cohort is full'))
    render(<PendingRequests cohortId="c1" onApproved={vi.fn()} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0])
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('This cohort is full.'))
    expect(screen.getByText('Waiting for approval (2)')).toBeTruthy()
  })
})

describe('cohort details form', () => {
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
  }

  it('requires a contact once approval is checked, and saves both', async () => {
    loads['/learn/cohorts/c1'] = cohort
    loads['/learn/cohorts/c1/join-requests'] = []
    send.mockResolvedValue(cohort)
    render(<CohortPage cohortId="c1" />)
    expect(screen.queryByLabelText(/Contact for learners/)).toBeNull()
    await userEvent.click(screen.getByLabelText(/Ask an admin to approve/))
    const contact = screen.getByLabelText(/Contact for learners/) as HTMLInputElement
    expect(contact.required).toBe(true)
    expect(screen.getByText(/Name and email or phone/)).toBeTruthy()
    await userEvent.type(contact, 'Pat, pat@x.edu')
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }))
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        'PUT',
        '/learn/cohorts/c1',
        expect.objectContaining({ requiresApproval: true, joinContact: 'Pat, pat@x.edu' })
      )
    )
  })
})
