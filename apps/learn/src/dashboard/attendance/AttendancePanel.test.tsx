// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const send = vi.fn()
const reload = vi.fn()
const loads: Record<string, unknown> = {}
const errors: Record<string, Error> = {}
vi.mock('../api', () => ({
  useApiSend: () => send,
  useApiFetch: () => vi.fn(),
  downloadFile: vi.fn(),
  useLoad: (path: string) => ({
    data: errors[path] ? null : (loads[path] ?? null),
    error: errors[path] ?? null,
    loading: false,
    reload,
  }),
}))

import { AttendancePanel } from './AttendancePanel'

afterEach(() => {
  cleanup()
  send.mockReset()
  reload.mockReset()
  for (const k of Object.keys(loads)) delete loads[k]
  for (const k of Object.keys(errors)) delete errors[k]
})

const counts = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 3 }
const session = {
  id: 's1',
  cohortId: 'c1',
  title: 'Session 1',
  startsAt: '2026-10-05T14:00:00.000Z',
  endsAt: null,
  location: null,
  counts,
}
const names = ['Ann Able', 'Bo Baker', 'Cy Cole']
const sheet = (statuses: (string | null)[] = [null, null, null]) => ({
  session,
  rows: names.map((name, i) => ({
    userId: `u${i + 1}`,
    enrollmentId: `e${i + 1}`,
    name,
    email: null,
    status: statuses[i],
    note: null,
    markedAt: null,
  })),
})
const setup = () => {
  loads['/learn/cohorts/c1/sessions'] = [session]
  loads['/learn/cohorts/c1/sessions/s1/marks'] = sheet()
  return render(<AttendancePanel cohortId="c1" />)
}
const pressed = (name: string, status: string) =>
  within(screen.getByRole('radiogroup', { name: `Status for ${name}` })).getByRole('radio', {
    name: new RegExp(status),
  })

describe('AttendancePanel', () => {
  it('marks everyone present, flips two, and saves exactly the payload', async () => {
    setup()
    const save = screen.getByRole('button', { name: 'Save attendance' })
    expect((save as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Mark everyone present' }))
    expect(screen.getByText('3 present')).toBeTruthy()
    await userEvent.click(pressed('Bo Baker', 'Absent'))
    await userEvent.click(pressed('Cy Cole', 'Late'))
    expect(screen.getByText('1 present')).toBeTruthy()
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    send.mockResolvedValue({
      session,
      rows: sheet(['present', 'absent', 'late']).rows,
    })
    await userEvent.click(save)
    expect(send).toHaveBeenCalledWith('PUT', '/learn/cohorts/c1/sessions/s1/marks', {
      marks: [
        { userId: 'u1', status: 'present', note: null },
        { userId: 'u2', status: 'absent', note: null },
        { userId: 'u3', status: 'late', note: null },
      ],
    })
    expect(await screen.findByText(/^Saved at \d{2}:\d{2}$/)).toBeTruthy()
    expect(screen.getByText('All changes saved')).toBeTruthy()
    expect(reload).toHaveBeenCalled()
  })

  it('keyboard: a focused row takes p/a/l/e and arrows move', async () => {
    setup()
    const rows = screen.getAllByRole('listitem').filter((li) => li.tabIndex === 0)
    rows[0].focus()
    await userEvent.keyboard('a')
    expect(pressed('Ann Able', 'Absent').getAttribute('aria-checked')).toBe('true')
    await userEvent.keyboard('{ArrowDown}e')
    expect(pressed('Bo Baker', 'Excused').getAttribute('aria-checked')).toBe('true')
  })

  it('N opens and focuses the note of the focused row', async () => {
    setup()
    screen
      .getAllByRole('listitem')
      .filter((li) => li.tabIndex === 0)[1]
      .focus()
    await userEvent.keyboard('n')
    expect(document.activeElement).toBe(screen.getByLabelText('Note for Bo Baker'))
    // Typing inside the note never triggers the status shortcuts.
    await userEvent.keyboard('pal')
    expect((document.activeElement as HTMLInputElement).value).toBe('pal')
    expect(pressed('Bo Baker', 'Present').getAttribute('aria-checked')).toBe('false')
  })

  it('status is a radiogroup with one tab stop, arrows choose, Enter and Space work, and a hidden status announces', async () => {
    setup()
    const group = screen.getByRole('radiogroup', { name: 'Status for Ann Able' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1, -1])
    radios[0].focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(pressed('Ann Able', 'Absent').getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(pressed('Ann Able', 'Absent'))
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.tabIndex)
    ).toEqual([-1, 0, -1, -1])
    await userEvent.keyboard('{Enter}')
    await userEvent.tab()
    pressed('Bo Baker', 'Present').focus()
    await userEvent.keyboard(' ')
    expect(pressed('Bo Baker', 'Present').getAttribute('aria-checked')).toBe('true')
    const announce = document.querySelector('.dash-visually-hidden[role="status"]')!
    expect(announce.textContent).toBe('Bo Baker: present')
  })

  it('a save never overwrites a mark changed while it was in flight', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Mark everyone present' }))
    let finish!: (v: unknown) => void
    send.mockReturnValueOnce(new Promise((r) => (finish = r)))
    await userEvent.click(screen.getByRole('button', { name: 'Save attendance' }))
    await userEvent.click(pressed('Ann Able', 'Late')) // edited while saving
    finish(sheet(['present', 'present', 'present']))
    await waitFor(() => expect(screen.getByText(/^Saved at/)).toBeTruthy())
    expect(pressed('Ann Able', 'Late').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
  })

  it('warns before leaving with unsaved marks, and stops once saved', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Mark everyone present' }))
    const evt = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(evt)
    expect(evt.defaultPrevented).toBe(true)
    // Switching to the summary asks first; declining keeps us on the sheet.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.click(screen.getByRole('button', { name: 'Summary' }))
    expect(confirm).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save attendance' })).toBeTruthy()
    confirm.mockRestore()
  })

  it('shows the error on a failed save, keeps the marks, and retries', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Mark everyone present' }))
    send.mockRejectedValueOnce(new Error('Network down'))
    await userEvent.click(screen.getByRole('button', { name: 'Save attendance' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Network down')
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    send.mockResolvedValueOnce(sheet(['present', 'present', 'present']))
    await userEvent.click(screen.getByRole('button', { name: 'Save attendance' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('one tap adds a session with the default title', async () => {
    setup()
    send.mockResolvedValue({ ...session, id: 's2', title: 'Session 2' })
    await userEvent.click(screen.getByRole('button', { name: 'Add session' }))
    expect(send).toHaveBeenCalledWith(
      'POST',
      '/learn/cohorts/c1/sessions',
      expect.objectContaining({ title: 'Session 2', startsAt: expect.any(String) })
    )
    expect(await screen.findByText('Added Session 2; edit its title or time below.')).toBeTruthy()
    // A second tap straight away is ignored: the button is off for about a second and a half.
    const again = screen.getByRole('button', { name: 'Add session' }) as HTMLButtonElement
    expect(again.disabled).toBe(true)
    await userEvent.click(again)
    expect(send).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(again.disabled).toBe(false), { timeout: 2500 })
  })

  it('the session form shows required-field errors inline and moves focus to them', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Edit session' }))
    const title = screen.getByLabelText(/^Title/)
    await userEvent.clear(title)
    await userEvent.click(screen.getByRole('button', { name: 'Save session' }))
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByText('Enter a title.')).toBeTruthy()
    expect(document.activeElement).toBe(title)
    expect(title.getAttribute('aria-invalid')).toBe('true')
    await userEvent.type(title, 'Kickoff')
    send.mockRejectedValueOnce(new Error('endsAt must be after startsAt'))
    await userEvent.click(screen.getByRole('button', { name: 'Save session' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('endsAt must be after startsAt')
    expect(document.activeElement).toBe(alert)
  })

  it('confirms before deleting a session', async () => {
    setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.click(screen.getByRole('button', { name: 'Delete session' }))
    expect(send).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    send.mockResolvedValue({ deleted: true })
    await userEvent.click(screen.getByRole('button', { name: 'Delete session' }))
    expect(send).toHaveBeenCalledWith('DELETE', '/learn/cohorts/c1/sessions/s1')
    confirm.mockRestore()
  })

  it('offers a retry when the sessions fail to load', async () => {
    errors['/learn/cohorts/c1/sessions'] = new Error('x')
    render(<AttendancePanel cohortId="c1" />)
    expect(screen.getByRole('alert').textContent).toContain('Could not load the sessions')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reload).toHaveBeenCalled()
  })

  it('renders the summary grid with letters, rates and the export button', async () => {
    loads['/learn/cohorts/c1/sessions'] = [session]
    loads['/learn/cohorts/c1/attendance'] = {
      cohortId: 'c1',
      sessions: 2,
      sessionList: [
        { id: 's1', title: 'Session 1', startsAt: '2026-10-05T14:00:00Z', taken: true },
        { id: 's2', title: 'Session 2', startsAt: '2026-10-06T14:00:00Z', taken: false },
      ],
      rows: [
        {
          userId: 'u1',
          name: 'Ann Able',
          present: 1,
          absent: 0,
          late: 0,
          excused: 1,
          sessions: 1,
          sessionsHeld: 2,
          ratePct: 100,
          marks: { s1: 'present' },
          skipped: { s2: 'not_taken' },
        },
        {
          userId: 'u2',
          name: 'Bo Baker',
          present: 0,
          absent: 1,
          late: 0,
          excused: 0,
          sessions: 1,
          sessionsHeld: 2,
          ratePct: 0,
          marks: { s1: 'absent' },
          skipped: { s2: 'before_join' },
        },
      ],
    }
    render(<AttendancePanel cohortId="c1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Summary' }))
    const row = screen.getByRole('row', { name: /Bo Baker/ })
    expect(within(row).getByText('0%')).toBeTruthy()
    expect(within(row).getByText('A')).toBeTruthy()
    expect(within(row).getByText('·')).toBeTruthy()
    expect(within(row).getByLabelText(/before enrolled/)).toBeTruthy()
    const ann = screen.getByRole('row', { name: /Ann Able/ })
    expect(within(ann).getByText('100%')).toBeTruthy()
    expect(within(ann).getByLabelText(/attendance not taken yet/)).toBeTruthy()
    // Session names are in text, not only a hover tooltip; the untaken one says so.
    const head = screen.getByRole('columnheader', { name: /Session 2.*not taken yet/ })
    expect(head.querySelector('.dash-visually-hidden')!.textContent).toMatch(/Session 2/)
    // The legend sits above the table.
    const legend = screen.getByText(/P present, A absent/)
    const table = screen.getByRole('table')
    expect(legend.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Take attendance' }))
  })
})
