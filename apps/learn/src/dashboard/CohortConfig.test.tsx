// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const send = vi.fn()
const loads: Record<string, unknown> = {}
vi.mock('./api', () => ({
  useApiSend: () => send,
  useApiFetch: () => vi.fn(),
  downloadFile: vi.fn(),
  useLoad: (path: string) => ({
    data: loads[path] ?? null,
    error: null,
    loading: false,
    reload: vi.fn(),
  }),
}))
vi.mock('./app-context', () => ({ useApp: () => ({ href: (p: string) => p }) }))

import { CohortPage } from './CohortPage'

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
  maxLearners: 20,
  enrolled: 0,
  lengthWeeks: 4,
  roster: [],
  requiresApproval: false,
  joinContact: null,
  delivery: 'online',
  requiresProfile: false,
  profileRefreshMonths: null,
}
const setup = (over: object = {}) => {
  loads['/learn/cohorts/c1'] = { ...cohort, ...over }
  loads['/learn/cohorts/c1/join-requests'] = []
  send.mockResolvedValue({ ...cohort, ...over })
  return render(<CohortPage cohortId="c1" />)
}
const openBtn = () => screen.getByRole('button', { name: 'Edit cohort configuration' })

describe('cohort configuration dialog', () => {
  it('replaces the inline form: no details card, a button with a hidden gear icon opens the dialog', async () => {
    setup()
    expect(screen.queryByText('Cohort details')).toBeNull()
    expect(openBtn().querySelector('svg[aria-hidden="true"]')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(openBtn())
    expect(screen.getByRole('dialog', { name: 'Edit cohort configuration' })).toBeTruthy()
  })

  it('lays the form out in the four labelled groups', async () => {
    setup()
    await userEvent.click(openBtn())
    const dialog = screen.getByRole('dialog')
    const groups = within(dialog).getAllByRole('group')
    expect(groups.map((g) => g.querySelector('legend')!.textContent)).toEqual([
      'Basics',
      'How it meets',
      'Joining',
      'Profile',
    ])
    const basics = within(groups[0])
    for (const l of ['Name', 'Maximum learners', 'Start date', 'End date'])
      expect(basics.getByLabelText(new RegExp('^' + l))).toBeTruthy()
    expect(within(groups[1]).getByLabelText(/^Delivery/)).toBeTruthy()
  })

  it('shows the contact and refresh fields only when their switch is on', async () => {
    setup()
    await userEvent.click(openBtn())
    expect(screen.queryByLabelText(/Contact for learners/)).toBeNull()
    expect(screen.queryByLabelText('Ask learners to refresh it')).toBeNull()
    await userEvent.click(screen.getByLabelText(/Ask an admin to approve/))
    expect((screen.getByLabelText(/Contact for learners/) as HTMLInputElement).required).toBe(true)
    await userEvent.click(screen.getByLabelText(/Learners must complete their profile first/))
    expect(screen.getByLabelText('Ask learners to refresh it')).toBeTruthy()
  })

  it('sends the same PUT body as before, then closes with a Saved banner', async () => {
    setup()
    await userEvent.click(openBtn())
    await userEvent.selectOptions(screen.getByLabelText(/^Delivery/), 'live')
    await userEvent.click(screen.getByLabelText(/Ask an admin to approve/))
    await userEvent.type(screen.getByLabelText(/Contact for learners/), ' Pat, pat@x.edu ')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith('PUT', '/learn/cohorts/c1', {
        name: 'Fall',
        maxLearners: 20,
        startsAt: '2026-11-01',
        delivery: 'live',
        requiresApproval: true,
        joinContact: 'Pat, pat@x.edu',
        requiresProfile: false,
        profileRefreshMonths: null,
      })
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Saved.')).toBeTruthy()
    expect(document.activeElement).toBe(openBtn())
  })

  it('a missing contact is an error tied to its input, focus goes there, and nothing is sent', async () => {
    setup()
    await userEvent.click(openBtn())
    await userEvent.click(screen.getByLabelText(/Ask an admin to approve/))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const contact = screen.getByLabelText(/Contact for learners/)
    expect(send).not.toHaveBeenCalled()
    expect(contact.getAttribute('aria-invalid')).toBe('true')
    const msg = document.getElementById(contact.getAttribute('aria-describedby')!)!
    expect(msg.textContent).toMatch(/Enter a contact/)
    expect(document.activeElement).toBe(contact)
  })

  it('Esc, Cancel and the backdrop close it; an edited form asks first', async () => {
    setup()
    await userEvent.click(openBtn())
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(openBtn())
    await userEvent.click(openBtn())
    await userEvent.type(screen.getByLabelText('Name'), ' 2')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('dialog')).toBeTruthy()
    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    confirm.mockRestore()
  })
})

describe('cohort page order', () => {
  it('puts attendance above the roster for a live cohort, after the join code', () => {
    setup({ delivery: 'live' })
    const code = screen.getByRole('heading', { name: 'Join code' })
    const att = screen.getByRole('heading', { name: 'Attendance' })
    const roster = screen.getByRole('heading', { name: 'Roster' })
    const before = (a: Element, b: Element) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(before(code, att)).toBe(true)
    expect(before(att, roster)).toBe(true)
  })
  it('has no attendance for an online cohort', () => {
    setup()
    expect(screen.queryByRole('heading', { name: 'Attendance' })).toBeNull()
  })
})
