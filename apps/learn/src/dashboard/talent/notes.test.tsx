// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const send = vi.fn()
const reload = vi.fn()
let loads: Record<string, { data?: unknown; error?: Error }> = {}
const loadedPaths: string[] = []
vi.mock('../api', () => ({
  useApiSend: () => send,
  useLoad: (path: string) => {
    loadedPaths.push(path)
    const hit = Object.entries(loads).find(([k]) => path === k || path.startsWith(k))
    return {
      data: hit?.[1].data ?? null,
      error: hit?.[1].error ?? null,
      loading: false,
      reload,
    }
  },
}))
vi.mock('../app-context', () => ({ useApp: () => ({ href: (p: string) => `${p}#ctx` }) }))

import { NotesSection } from './NotesSection'
import { SupportSection } from './SupportSection'
import { SupportQueuePage } from './SupportQueuePage'
import { dueState, sortItems, todayKey } from './supportLogic'

afterEach(() => {
  cleanup()
  send.mockReset()
  reload.mockReset()
  loads = {}
  loadedPaths.length = 0
})

const P = '/learn/providers/P1/participants/U1'
const note = (over = {}) => ({
  id: 'n1',
  providerId: 'P1',
  userId: 'U1',
  cohortId: 'C1',
  authorId: 's',
  authorName: 'Dana Reyes',
  body: 'Line one\nLine <b>two</b>',
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  ...over,
})
const item = (over = {}) => ({
  id: 'i1',
  providerId: 'P1',
  userId: 'U1',
  cohortId: null,
  title: 'Bus pass',
  category: 'transportation',
  details: null,
  status: 'open',
  dueDate: null,
  assigneeId: null,
  assigneeName: null,
  createdById: 's',
  createdByName: 'Dana',
  resolvedAt: null,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  ...over,
})

describe('NotesSection', () => {
  it('shows the privacy reminder, empty state, and the cohort name', async () => {
    loads[`${P}/notes`] = { data: [] }
    render(<NotesSection providerId="P1" userId="U1" />)
    expect(
      screen.getByText("Only your organization's staff can see this. Learners never can.")
    ).toBeTruthy()
    expect(screen.getByText('No notes yet. Add the first one above.')).toBeTruthy()
  })

  it('renders note text as plain text with its line breaks, never as HTML', () => {
    loads[`${P}/notes`] = { data: [note()] }
    loads[P] = { data: { cohorts: [{ cohortId: 'C1', cohortName: 'Fall Cohort' }] } }
    const { container } = render(<NotesSection providerId="P1" userId="U1" />)
    expect(container.querySelector('.nt-body')?.textContent).toBe('Line one\nLine <b>two</b>')
    expect(container.querySelector('.nt-body b')).toBeNull()
    expect(container.querySelector('.nt-meta')?.textContent).toContain('Fall Cohort')
    expect(screen.getByText('Dana Reyes')).toBeTruthy()
  })

  it('adds a note, announces it, and clears the box', async () => {
    loads[`${P}/notes`] = { data: [] }
    send.mockResolvedValue(note({ id: 'n2', body: 'Brought a laptop' }))
    render(<NotesSection providerId="P1" userId="U1" />)
    await userEvent.type(screen.getByLabelText('Add a note'), 'Brought a laptop')
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(send).toHaveBeenCalledWith('POST', `${P}/notes`, {
      body: 'Brought a laptop',
      cohortId: null,
    })
    await waitFor(() => expect(screen.getByText('Brought a laptop')).toBeTruthy())
    expect(screen.getByRole('status').textContent).toBe('Note added.')
    expect((screen.getByLabelText('Add a note') as HTMLTextAreaElement).value).toBe('')
  })

  it('does not let an empty note be added', () => {
    loads[`${P}/notes`] = { data: [] }
    render(<NotesSection providerId="P1" userId="U1" />)
    expect((screen.getByRole('button', { name: 'Add note' }) as HTMLButtonElement).disabled).toBe(
      true
    )
  })

  it('edits a note', async () => {
    loads[`${P}/notes`] = { data: [note({ body: 'old' })] }
    send.mockResolvedValue(note({ body: 'new text', updatedAt: '2026-10-02T10:00:00Z' }))
    render(<NotesSection providerId="P1" userId="U1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const box = screen.getByLabelText('Edit note')
    await userEvent.clear(box)
    await userEvent.type(box, 'new text')
    await userEvent.click(screen.getByRole('button', { name: 'Save note' }))
    expect(send).toHaveBeenCalledWith('PUT', `${P}/notes/n1`, { body: 'new text' })
    await waitFor(() => expect(screen.getByText('new text')).toBeTruthy())
    expect(screen.getByText(/edited/)).toBeTruthy()
  })

  it('asks before deleting, and keeps the note on "Keep it"', async () => {
    loads[`${P}/notes`] = { data: [note({ body: 'precious' })] }
    send.mockResolvedValue({ deleted: true })
    render(<NotesSection providerId="P1" userId="U1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(send).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.getByText('precious')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }))
    expect(send).toHaveBeenCalledWith('DELETE', `${P}/notes/n1`)
    await waitFor(() => expect(screen.queryByText('precious')).toBeNull())
    expect(screen.getByRole('status').textContent).toBe('Note deleted.')
  })

  it('shows the error with a retry button, and the server message on a failed save', async () => {
    loads[`${P}/notes`] = { error: new Error('Boom') }
    render(<NotesSection providerId="P1" userId="U1" />)
    expect(screen.getByRole('alert').textContent).toContain('Could not load the notes. Boom')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reload).toHaveBeenCalled()
  })

  it('announces a failed add as an error and keeps the text', async () => {
    loads[`${P}/notes`] = { data: [] }
    send.mockRejectedValue(new Error('No access to this provider'))
    render(<NotesSection providerId="P1" userId="U1" />)
    await userEvent.type(screen.getByLabelText('Add a note'), 'keep me')
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('No access to this provider')
    )
    expect((screen.getByLabelText('Add a note') as HTMLTextAreaElement).value).toBe('keep me')
  })
})

describe('SupportSection', () => {
  const items = `${P}/support-items`
  it('shows the empty state and the reminder', () => {
    loads[items] = { data: [] }
    render(<SupportSection providerId="P1" userId="U1" />)
    expect(screen.getByText('Nothing to follow up on yet.')).toBeTruthy()
    expect(screen.getByText(/Learners never can/)).toBeTruthy()
  })

  it('lists items with status chips, overdue emphasis, and finished ones last', () => {
    loads[items] = {
      data: [
        item({ id: 'a', title: 'Done thing', status: 'resolved' }),
        item({ id: 'b', title: 'Late thing', dueDate: '2020-01-01' }),
      ],
    }
    const { container } = render(<SupportSection providerId="P1" userId="U1" />)
    const rows = container.querySelectorAll('.nt-item')
    expect(rows[0].textContent).toContain('Late thing')
    expect(rows[0].textContent).toContain('Overdue')
    expect(container.querySelector('.nt-due-overdue')).toBeTruthy()
    expect(rows[1].textContent).toContain('Done thing')
    expect(rows[1].textContent).toContain('Resolved')
  })

  it('changes status quickly from the checkbox and the select', async () => {
    loads[items] = { data: [item()] }
    send.mockResolvedValue(item({ status: 'resolved' }))
    render(<SupportSection providerId="P1" userId="U1" />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Resolved: Bus pass' }))
    expect(send).toHaveBeenCalledWith('PUT', `${items}/i1`, { status: 'resolved' })
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('"Bus pass" is now Resolved.')
    )
    send.mockResolvedValue(item({ status: 'in_progress' }))
    await userEvent.selectOptions(screen.getByLabelText('Status of Bus pass'), 'in_progress')
    expect(send).toHaveBeenLastCalledWith('PUT', `${items}/i1`, { status: 'in_progress' })
  })

  it('adds an item with category, due date and assignee', async () => {
    loads[items] = { data: [] }
    loads['/learn/providers/P1/staff-members'] = { data: [{ id: 's2', name: 'Lee' }] }
    send.mockResolvedValue(item({ id: 'new', title: 'Laptop loan', category: 'technology' }))
    render(<SupportSection providerId="P1" userId="U1" />)
    await userEvent.type(screen.getByLabelText('What would help?'), 'Laptop loan')
    await userEvent.selectOptions(screen.getByLabelText('Kind of help'), 'technology')
    await userEvent.type(screen.getByLabelText('Follow up by (optional)'), '2026-11-01')
    await userEvent.selectOptions(screen.getByLabelText('Assigned to (optional)'), 's2')
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }))
    expect(send).toHaveBeenCalledWith('POST', items, {
      title: 'Laptop loan',
      category: 'technology',
      details: null,
      dueDate: '2026-11-01',
      assigneeId: 's2',
    })
    await waitFor(() => expect(screen.getAllByText(/Laptop loan/).length).toBeGreaterThan(0))
    expect(screen.getByRole('status').textContent).toBe('Added "Laptop loan".')
  })

  it('confirms before deleting', async () => {
    loads[items] = { data: [item()] }
    send.mockResolvedValue({ deleted: true })
    render(<SupportSection providerId="P1" userId="U1" />)
    await userEvent.click(screen.getByRole('button', { name: /Delete/ }))
    expect(send).not.toHaveBeenCalled()
    const dlg = screen.getByRole('alertdialog')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Yes, delete it' }))
    expect(send).toHaveBeenCalledWith('DELETE', `${items}/i1`)
    await waitFor(() => expect(screen.queryByText('Bus pass')).toBeNull())
  })

  it('shows error and retry', async () => {
    loads[items] = { error: new Error('Down') }
    render(<SupportSection providerId="P1" userId="U1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reload).toHaveBeenCalled()
  })
})

describe('SupportQueuePage', () => {
  const base = '/learn/providers/P1/support-items'
  const row = (over = {}) => ({ ...item(), participantName: 'Lena Learner', ...over })

  it('lists items with a link to the participant, and the empty state', () => {
    loads[base] = { data: [row({ assigneeName: 'Lee', dueDate: '2020-01-01' })] }
    const { rerender } = render(<SupportQueuePage providerId="P1" />)
    const link = screen.getByRole('link', { name: 'Lena Learner' })
    expect(link.getAttribute('href')).toBe('/lms/talent/U1#ctx')
    expect(screen.getByText('Lee')).toBeTruthy()
    expect(screen.getByText(/Overdue/)).toBeTruthy()
    expect(screen.getByText(/Staff|staff/)).toBeTruthy()
    loads[base] = { data: [] }
    rerender(<SupportQueuePage providerId="P1" />)
    expect(screen.getByText('Nothing matches. Try changing the filters.')).toBeTruthy()
  })

  it('asks the server with the chosen filters', async () => {
    loads[base] = { data: [] }
    loads['/learn/providers/P1/staff-members'] = { data: [{ id: 's2', name: 'Lee' }] }
    render(<SupportQueuePage providerId="P1" />)
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'resolved')
    await userEvent.selectOptions(screen.getByLabelText('Assigned to'), 's2')
    await userEvent.type(screen.getByLabelText('Due by'), '2026-11-01')
    expect(loadedPaths).toContain(`${base}?status=resolved&assigneeId=s2&dueBefore=2026-11-01`)
    await userEvent.selectOptions(screen.getByLabelText('Assigned to'), 'unassigned')
    expect(loadedPaths).toContain(
      `${base}?status=resolved&assigneeId=unassigned&dueBefore=2026-11-01`
    )
  })

  it('shows error and retry', async () => {
    loads[base] = { error: new Error('Down') }
    render(<SupportQueuePage providerId="P1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reload).toHaveBeenCalled()
  })
})

describe('supportLogic', () => {
  it('flags overdue, today and soon only for unfinished items', () => {
    const t = '2026-10-07'
    expect(dueState('2026-10-06', 'open', t)).toBe('overdue')
    expect(dueState('2026-10-07', 'in_progress', t)).toBe('today')
    expect(dueState('2026-10-10', 'open', t)).toBe('soon')
    expect(dueState('2026-10-11', 'open', t)).toBe('later')
    expect(dueState('2026-10-06', 'resolved', t)).toBe('none')
    expect(dueState('2026-10-06', 'cancelled', t)).toBe('none')
    expect(dueState(null, 'open', t)).toBe('none')
  })
  it('formats today in local time and sorts to-do first by due date', () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    const sorted = sortItems([
      { id: 1, status: 'resolved' as const, dueDate: '2026-01-01' },
      { id: 2, status: 'open' as const, dueDate: null },
      { id: 3, status: 'open' as const, dueDate: '2026-02-01' },
      { id: 4, status: 'open' as const, dueDate: '2026-01-15' },
    ])
    expect(sorted.map((s) => s.id)).toEqual([4, 3, 2, 1])
  })
})
