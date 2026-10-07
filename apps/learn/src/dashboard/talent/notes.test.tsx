// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupportItemDto } from '@id/types'

const send = vi.fn()
const reload = vi.fn()
let loads: Record<string, { data?: unknown; error?: Error; loading?: boolean }> = {}
const loadedPaths: string[] = []
vi.mock('../api', () => ({
  useApiSend: () => send,
  useLoad: (path: string | null) => {
    if (path) loadedPaths.push(path)
    const hit = path
      ? Object.entries(loads).find(([k]) => path === k || path.startsWith(k))
      : undefined
    return {
      data: hit?.[1].data ?? null,
      error: hit?.[1].error ?? null,
      loading: hit?.[1].loading ?? false,
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
  it('shows the privacy notice, empty state, and the cohort name', async () => {
    loads[`${P}/notes`] = { data: [] }
    render(<NotesSection providerId="P1" userId="U1" />)
    expect(
      screen.getByText(
        "Instructor notes are for your team: record context, observations and next steps so whoever works with this person next is up to speed. Your organization's staff can read them. Learners never can."
      )
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

  it('gives focus back to the control that opened edit or delete, and to the heading after a delete', async () => {
    loads[`${P}/notes`] = { data: [note({ body: 'keep me' })] }
    send.mockResolvedValue({ deleted: true })
    render(<NotesSection providerId="P1" userId="U1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const group = screen.getByRole('group', { name: 'Delete this note?' })
    expect(group.getAttribute('aria-describedby')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }))
    await waitFor(() => expect(screen.queryByText('keep me')).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Instructor notes' }))
  })

  it('does not fetch the participant header when the page already has the cohorts', () => {
    loads[`${P}/notes`] = { data: [] }
    render(
      <NotesSection
        providerId="P1"
        userId="U1"
        cohorts={[
          { cohortId: 'C1', cohortName: 'Fall', courseTitle: 'Data', enrollmentStatus: 'enrolled' },
        ]}
      />
    )
    expect(loadedPaths).not.toContain(P)
    expect(screen.getByRole('option', { name: 'Fall' })).toBeTruthy()
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
  const ymd = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return todayKey(d)
  }

  it('shows the empty state, the notice, a zero count and the Add button', () => {
    loads[items] = { data: [] }
    render(<SupportSection providerId="P1" userId="U1" />)
    expect(
      screen.getByText(
        'No follow-ups yet. Add one when someone needs help with something like transportation or childcare.'
      )
    ).toBeTruthy()
    expect(screen.getByText(/Learners never can/)).toBeTruthy()
    expect(screen.getByText('0 open')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add follow-up' })).toBeTruthy()
    expect(screen.queryByLabelText('What would help?')).toBeNull()
  })

  it('shows chips, overdue and due-soon flags, one status control, and a collapsed resolved group', async () => {
    loads[items] = {
      data: [
        item({
          id: 'a',
          title: 'Done thing',
          status: 'resolved',
          resolvedAt: '2026-10-02T10:00:00Z',
        }),
        item({ id: 'b', title: 'Late thing', dueDate: ymd(-3), assigneeName: 'Lee' }),
        item({ id: 'c', title: 'Soon thing', dueDate: ymd(2), status: 'in_progress' }),
      ],
    }
    const { container } = render(<SupportSection providerId="P1" userId="U1" />)
    const rows = container.querySelectorAll('.nt-item')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('Late thing')
    expect(rows[0].textContent).toContain('Overdue by 3 days')
    expect(rows[0].textContent).toContain('Assigned to Lee')
    expect(rows[0].textContent).toContain('Transportation')
    expect(rows[1].textContent).toContain('Due soon')
    expect(rows[1].textContent).toContain('Unassigned')
    expect(rows[1].textContent).toContain('Added by Dana')
    expect(screen.getByText('2 open')).toBeTruthy()
    // One status control per item: no checkbox, no status chip.
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getAllByRole('combobox', { name: /^Status/ })).toHaveLength(2)
    // Finished items are tucked away until asked for.
    expect(screen.queryByText('Done thing')).toBeNull()
    const toggle = screen.getByRole('button', { name: /Resolved \(1\)/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(toggle)
    expect(screen.getAllByText('Done thing').length).toBeGreaterThan(0)
    expect(container.textContent).toContain('Resolved Oct 2, 2026')
  })

  it('changes status from the one select, saves at once and announces it', async () => {
    loads[items] = { data: [item()] }
    send.mockResolvedValue(item({ status: 'in_progress' }))
    render(<SupportSection providerId="P1" userId="U1" />)
    await userEvent.selectOptions(screen.getByLabelText('Status of Bus pass'), 'in_progress')
    expect(send).toHaveBeenCalledWith('PUT', `${items}/i1`, { status: 'in_progress' })
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('"Bus pass" is now In progress.')
    )
  })

  it('adds a follow-up through the dialog with kind, date and assignee', async () => {
    loads[items] = { data: [] }
    loads['/learn/providers/P1/staff-members'] = { data: [{ id: 's2', name: 'Lee' }] }
    send.mockResolvedValue(item({ id: 'new', title: 'Laptop loan', category: 'technology' }))
    render(<SupportSection providerId="P1" userId="U1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Add follow-up' }))
    const dlg = within(screen.getByRole('dialog', { name: 'Add follow-up' }))
    await userEvent.type(dlg.getByLabelText('What would help?'), 'Laptop loan')
    await userEvent.selectOptions(dlg.getByLabelText('Kind of help'), 'technology')
    await userEvent.type(dlg.getByLabelText('Follow up by'), '2026-11-01')
    await userEvent.selectOptions(dlg.getByLabelText('Assigned to'), 's2')
    await userEvent.click(dlg.getByRole('button', { name: 'Save' }))
    expect(send).toHaveBeenCalledWith('POST', items, {
      title: 'Laptop loan',
      category: 'technology',
      details: null,
      dueDate: '2026-11-01',
      assigneeId: 's2',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getAllByText(/Laptop loan/).length).toBeGreaterThan(0)
    expect(screen.getByRole('status').textContent).toBe('Added "Laptop loan".')
  })

  it('needs a title before it saves, and shows a save error inside the dialog', async () => {
    loads[items] = { data: [] }
    send.mockRejectedValue(new Error('Nope'))
    render(<SupportSection providerId="P1" userId="U1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Add follow-up' }))
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    await userEvent.type(screen.getByLabelText('What would help?'), 'x')
    await userEvent.click(save)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Nope'))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('edits through the same dialog, prefilled, and saves the change', async () => {
    loads[items] = { data: [item({ details: 'Route 14', dueDate: '2030-01-05' })] }
    send.mockResolvedValue(item({ title: 'Bus pass, monthly' }))
    render(<SupportSection providerId="P1" userId="U1" />)
    await userEvent.click(screen.getByRole('button', { name: /^Edit/ }))
    const dlg = within(screen.getByRole('dialog', { name: 'Edit follow-up' }))
    const title = dlg.getByLabelText('What would help?') as HTMLInputElement
    expect(title.value).toBe('Bus pass')
    expect((dlg.getByLabelText('Details') as HTMLTextAreaElement).value).toBe('Route 14')
    expect((dlg.getByLabelText('Follow up by') as HTMLInputElement).value).toBe('2030-01-05')
    await userEvent.clear(title)
    await userEvent.type(title, 'Bus pass, monthly')
    await userEvent.click(dlg.getByRole('button', { name: 'Save' }))
    expect(send).toHaveBeenCalledWith(
      'PUT',
      `${items}/i1`,
      expect.objectContaining({ title: 'Bus pass, monthly', details: 'Route 14' })
    )
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Saved "Bus pass, monthly".')
    )
  })

  it('clamps long details behind Show more', async () => {
    loads[items] = { data: [item({ details: 'x'.repeat(300) })] }
    const { container } = render(<SupportSection providerId="P1" userId="U1" />)
    expect(container.querySelector('.nt-clamp')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(container.querySelector('.nt-clamp')).toBeNull()
  })

  it('confirms before deleting', async () => {
    loads[items] = { data: [item()] }
    send.mockResolvedValue({ deleted: true })
    render(<SupportSection providerId="P1" userId="U1" />)
    await userEvent.click(screen.getByRole('button', { name: /^Delete/ }))
    expect(send).not.toHaveBeenCalled()
    const dlg = screen.getByRole('group', { name: /Delete Bus pass/ })
    await userEvent.click(within(dlg).getByRole('button', { name: 'Yes, delete it' }))
    expect(send).toHaveBeenCalledWith('DELETE', `${items}/i1`)
    await waitFor(() => expect(screen.queryByText('Bus pass')).toBeNull())
  })

  it('embedded: uses the items it is given, loads no list, has no heading or notice of its own', () => {
    loads[items] = { data: [] }
    const counts: number[] = []
    render(
      <SupportSection
        providerId="P1"
        userId="U1"
        embedded
        initial={[item(), item({ id: 'z', title: 'Old', status: 'resolved' })] as SupportItemDto[]}
        onOpenCount={(n) => counts.push(n)}
      />
    )
    expect(loadedPaths).not.toContain(items)
    expect(screen.getByText('1 open')).toBeTruthy()
    expect(counts).toContain(1)
    expect(screen.queryByText(/Learners never can/)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Support follow-ups' })).toBeNull()
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

  it('says Updating while a new filter loads, and surfaces a staff list failure', () => {
    loads[base] = { data: [row()], loading: true }
    loads['/learn/providers/P1/staff-members'] = { error: new Error('No staff for you') }
    render(<SupportQueuePage providerId="P1" />)
    expect(screen.getByRole('status').textContent).toBe('Updating…')
    expect(screen.queryByText('1 item')).toBeNull()
    expect(screen.getByText(/No staff for you/)).toBeTruthy()
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
