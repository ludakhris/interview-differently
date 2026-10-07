// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const send = vi.fn()
const reload = vi.fn()
const downloadFile = vi.fn().mockResolvedValue(undefined)
const loads: Record<string, unknown> = {}
const errors: Record<string, Error> = {}
vi.mock('../api', () => ({
  useApiSend: () => send,
  useApiFetch: () => vi.fn(),
  downloadFile: (...a: unknown[]) => downloadFile(...a),
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
  downloadFile.mockReset()
  downloadFile.mockResolvedValue(undefined)
  for (const k of Object.keys(loads)) delete loads[k]
  for (const k of Object.keys(errors)) delete errors[k]
})

const DAY = 86_400_000
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString()
const counts = (present = 0, absent = 0, late = 0, excused = 0, unmarked = 0) => ({
  present,
  absent,
  late,
  excused,
  unmarked,
})
const mk = (id: string, title: string, startsAt: string, c = counts(0, 0, 0, 0, 3)) => ({
  id,
  cohortId: 'c1',
  title,
  startsAt,
  endsAt: null,
  location: null,
  counts: c,
})
const taken = mk('s1', 'Session 1', iso(-3), counts(2, 1))
const untaken = mk('s2', 'Session 2', iso(-1))
const upcoming = mk('s3', 'Session 3', iso(3))

const names = ['Ann Able', 'Bo Baker', 'Cy Cole']
const sheetOf = (
  session: typeof taken,
  rows: { status: string | null; note: string | null }[]
) => ({
  session,
  rows: names.map((name, i) => ({
    userId: `u${i + 1}`,
    enrollmentId: `e${i + 1}`,
    name,
    email: null,
    status: rows[i]?.status ?? null,
    note: rows[i]?.note ?? null,
    markedAt: null,
  })),
})
const summaryRow = (
  i: number,
  present: number,
  late: number,
  counted: number,
  ratePct: number | null,
  extra: object = {}
) => ({
  userId: `u${i}`,
  name: names[i - 1],
  present,
  absent: counted - present - late,
  late,
  excused: 0,
  sessions: counted,
  sessionsHeld: 1,
  ratePct,
  marks: { s1: 'present' },
  skipped: {},
  notes: {},
  ...extra,
})
const summary = {
  cohortId: 'c1',
  sessions: 2,
  sessionList: [{ id: 's1', title: 'Session 1', startsAt: taken.startsAt, taken: true }],
  rows: [
    summaryRow(1, 1, 0, 1, 100, { notes: { s1: 'Brought a guest' } }),
    summaryRow(2, 0, 0, 1, 0, { marks: { s1: 'absent' } }),
    summaryRow(3, 0, 1, 1, 100, { marks: { s1: 'late' } }),
  ],
}

const setup = (sessions = [taken, untaken, upcoming]) => {
  loads['/learn/cohorts/c1/sessions'] = sessions
  loads['/learn/cohorts/c1/attendance'] = summary
  loads['/learn/cohorts/c1/sessions/s1/marks'] = sheetOf(taken, [
    { status: 'present', note: 'Brought a guest' },
    { status: 'absent', note: null },
    { status: 'late', note: null },
  ])
  loads['/learn/cohorts/c1/sessions/s2/marks'] = sheetOf(untaken, [])
  return render(<AttendancePanel cohortId="c1" />)
}
const rowOf = (title: string) =>
  within(screen.getByRole('table', { name: 'Sessions' })).getByRole('row', {
    name: new RegExp(title),
  })
const radio = (name: string, status: string) =>
  within(screen.getByRole('radiogroup', { name: `Status for ${name}` })).getByRole('radio', {
    name: new RegExp(status),
  })

describe('status strip', () => {
  it('shows held and upcoming, the overall rate, the last session and learners below 75%', () => {
    setup()
    const strip = screen.getByLabelText('Attendance status')
    // Two sessions have started, one is ahead.
    expect(within(strip).getByText('2 held · 1 upcoming')).toBeTruthy()
    // (1 + 0 + 1) attended of 3 counted.
    expect(within(strip).getByText('67%')).toBeTruthy()
    expect(within(strip).getByText(/· 2 present$/)).toBeTruthy()
    expect(within(strip).getByRole('button', { name: '1 learner' })).toBeTruthy()
  })

  it('clicking the below-threshold count filters the grid to those learners, and clears', async () => {
    setup()
    const grid = () => screen.getByRole('region', { name: 'Attendance by learner' })
    expect(within(grid()).getAllByRole('link')).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: '1 learner' }))
    expect(
      within(grid())
        .getAllByRole('link')
        .map((a) => a.textContent)
    ).toEqual(['Bo Baker'])
    await userEvent.click(screen.getByRole('button', { name: 'Show everyone' }))
    expect(within(grid()).getAllByRole('link')).toHaveLength(3)
  })
})

describe('sessions table', () => {
  it('a taken session shows counts and Edit attendance; an untaken one says so and offers Record', () => {
    setup()
    const r1 = rowOf('Session 1')
    expect(within(r1).getByText('2 present')).toBeTruthy()
    expect(within(r1).getByText('1 absent')).toBeTruthy()
    expect(within(r1).getByRole('button', { name: /Edit attendance for Session 1/ })).toBeTruthy()
    const r2 = rowOf('Session 2')
    expect(within(r2).getByText('Not taken yet')).toBeTruthy()
    expect(within(r2).getByRole('button', { name: /Record attendance for Session 2/ })).toBeTruthy()
  })

  it('no mention of grant reporting; buttons say Download CSV', () => {
    setup()
    expect(document.body.textContent).not.toMatch(/grant/i)
    expect(screen.getAllByRole('button', { name: /Download CSV/ }).length).toBe(4)
  })

  it('Record attendance opens the sheet dialog; Esc closes it and returns focus', async () => {
    setup()
    const opener = within(rowOf('Session 2')).getByRole('button', { name: /Record attendance/ })
    await userEvent.click(opener)
    expect(screen.getByRole('dialog', { name: 'Record attendance: Session 2' })).toBeTruthy()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('View opens a read-only list with statuses and notes, and Edit attendance leads to the sheet', async () => {
    setup()
    await userEvent.click(
      within(rowOf('Session 1')).getByRole('button', { name: /View attendance/ })
    )
    const dialog = screen.getByRole('dialog', { name: 'Attendance: Session 1' })
    expect(within(dialog).getByText('Brought a guest')).toBeTruthy()
    expect(within(dialog).getByText('Absent')).toBeTruthy()
    expect(within(dialog).queryByRole('radiogroup')).toBeNull()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download CSV' }))
    expect(downloadFile).toHaveBeenCalledWith(
      expect.anything(),
      '/learn/cohorts/c1/sessions/s1/attendance.csv',
      'attendance-session-1.csv'
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Edit attendance' }))
    expect(screen.getByRole('dialog', { name: 'Edit attendance: Session 1' })).toBeTruthy()
  })

  it('the row Download CSV button fetches that session', async () => {
    setup()
    await userEvent.click(within(rowOf('Session 2')).getByRole('button', { name: /Download CSV/ }))
    expect(downloadFile).toHaveBeenCalledWith(
      expect.anything(),
      '/learn/cohorts/c1/sessions/s2/attendance.csv',
      'attendance-session-2.csv'
    )
  })

  it('Edit session opens the session dialog with its values and PUTs the change', async () => {
    setup()
    await userEvent.click(within(rowOf('Session 1')).getByRole('button', { name: /Edit session/ }))
    const dialog = screen.getByRole('dialog', { name: 'Edit session' })
    const title = within(dialog).getByLabelText(/^Title/)
    expect((title as HTMLInputElement).value).toBe('Session 1')
    await userEvent.clear(title)
    await userEvent.type(title, 'Kickoff')
    send.mockResolvedValue({ ...taken, title: 'Kickoff' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save session' }))
    expect(send).toHaveBeenCalledWith(
      'PUT',
      '/learn/cohorts/c1/sessions/s1',
      expect.objectContaining({ title: 'Kickoff', location: null })
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(reload).toHaveBeenCalled()
  })

  it('Add session is a dialog with the next title and now; one tap on Add saves it', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Add session' }))
    const dialog = screen.getByRole('dialog', { name: 'Add session' })
    expect((within(dialog).getByLabelText(/^Title/) as HTMLInputElement).value).toBe('Session 4')
    send.mockResolvedValue({ ...upcoming, id: 's4', title: 'Session 4' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add session' }))
    expect(send).toHaveBeenCalledWith(
      'POST',
      '/learn/cohorts/c1/sessions',
      expect.objectContaining({ title: 'Session 4', startsAt: expect.any(String), location: null })
    )
    expect(await screen.findByText('Added Session 4.')).toBeTruthy()
  })

  it('the session form shows required-field errors inline and moves focus to them', async () => {
    setup()
    await userEvent.click(within(rowOf('Session 1')).getByRole('button', { name: /Edit session/ }))
    const title = screen.getByLabelText(/^Title/)
    await userEvent.clear(title)
    await userEvent.click(screen.getByRole('button', { name: 'Save session' }))
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByText('Enter a title.')).toBeTruthy()
    expect(document.activeElement).toBe(title)
    await userEvent.type(title, 'Kickoff')
    send.mockRejectedValueOnce(new Error('endsAt must be after startsAt'))
    await userEvent.click(screen.getByRole('button', { name: 'Save session' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('endsAt must be after startsAt')
    expect(document.activeElement).toBe(alert)
  })

  it('a dirty session dialog asks before Esc closes it', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Add session' }))
    await userEvent.type(screen.getByLabelText(/^Title/), ' x')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.keyboard('{Escape}')
    expect(confirm).toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
    confirm.mockRestore()
  })

  it('Cancel in the session dialog asks only when the form was edited', async () => {
    setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.click(screen.getByRole('button', { name: 'Add session' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Add session' }))
    await userEvent.type(screen.getByLabelText(/^Title/), ' x')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog')).toBeTruthy()
    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    confirm.mockRestore()
  })

  it('confirms before deleting a session', async () => {
    setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.click(
      within(rowOf('Session 1')).getByRole('button', { name: /Delete session/ })
    )
    expect(send).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    send.mockResolvedValue({ deleted: true })
    await userEvent.click(
      within(rowOf('Session 1')).getByRole('button', { name: /Delete session/ })
    )
    expect(send).toHaveBeenCalledWith('DELETE', '/learn/cohorts/c1/sessions/s1')
    confirm.mockRestore()
  })
})

describe('recording attendance with notes', () => {
  it('every row has a visible note field; mark all present, add a trimmed note, save the exact payload', async () => {
    setup()
    await userEvent.click(
      within(rowOf('Session 2')).getByRole('button', { name: /Record attendance/ })
    )
    const dialog = screen.getByRole('dialog')
    for (const n of names) {
      const note = within(dialog).getByLabelText(`Note for ${n}`) as HTMLInputElement
      expect(note.placeholder).toBe('Add a note')
    }
    const save = within(dialog).getByRole('button', { name: 'Save attendance' })
    expect((save as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark everyone present' }))
    await userEvent.click(radio('Bo Baker', 'Late'))
    await userEvent.type(within(dialog).getByLabelText('Note for Bo Baker'), '  stuck on the bus  ')
    send.mockResolvedValue(
      sheetOf(untaken, [
        { status: 'present', note: null },
        { status: 'late', note: 'stuck on the bus' },
        { status: 'present', note: null },
      ])
    )
    await userEvent.click(save)
    expect(send).toHaveBeenCalledWith('PUT', '/learn/cohorts/c1/sessions/s2/marks', {
      marks: [
        { userId: 'u1', status: 'present', note: null },
        { userId: 'u2', status: 'late', note: 'stuck on the bus' },
        { userId: 'u3', status: 'present', note: null },
      ],
    })
    expect(await screen.findByText(/^Saved at \d{2}:\d{2}$/)).toBeTruthy()
    expect(reload).toHaveBeenCalled()
  })

  it('N moves focus to the note of the focused row, and typing there does not change the status', async () => {
    setup()
    await userEvent.click(
      within(rowOf('Session 2')).getByRole('button', { name: /Record attendance/ })
    )
    screen
      .getAllByRole('listitem')
      .filter((li) => li.tabIndex === 0)[1]
      .focus()
    await userEvent.keyboard('n')
    expect(document.activeElement).toBe(screen.getByLabelText('Note for Bo Baker'))
    await userEvent.keyboard('pal')
    expect((document.activeElement as HTMLInputElement).value).toBe('pal')
    expect(radio('Bo Baker', 'Present').getAttribute('aria-checked')).toBe('false')
  })

  it('p/a/l/e set the status of a focused row', async () => {
    setup()
    await userEvent.click(
      within(rowOf('Session 2')).getByRole('button', { name: /Record attendance/ })
    )
    const rows = screen.getAllByRole('listitem').filter((li) => li.tabIndex === 0)
    rows[0].focus()
    await userEvent.keyboard('a')
    expect(radio('Ann Able', 'Absent').getAttribute('aria-checked')).toBe('true')
    await userEvent.keyboard('{ArrowDown}e')
    expect(radio('Bo Baker', 'Excused').getAttribute('aria-checked')).toBe('true')
  })

  it('closing with unsaved marks asks first', async () => {
    setup()
    await userEvent.click(
      within(rowOf('Session 2')).getByRole('button', { name: /Record attendance/ })
    )
    await userEvent.click(screen.getByRole('button', { name: 'Mark everyone present' }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(confirm).toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
    const evt = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(evt)
    expect(evt.defaultPrevented).toBe(true)
    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    confirm.mockRestore()
  })

  it('shows the error on a failed save, keeps the marks, and retries', async () => {
    setup()
    await userEvent.click(
      within(rowOf('Session 2')).getByRole('button', { name: /Record attendance/ })
    )
    await userEvent.click(screen.getByRole('button', { name: 'Mark everyone present' }))
    send.mockRejectedValueOnce(new Error('Network down'))
    await userEvent.click(screen.getByRole('button', { name: 'Save attendance' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Network down')
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    send.mockResolvedValueOnce(
      sheetOf(untaken, [
        { status: 'present', note: null },
        { status: 'present', note: null },
        { status: 'present', note: null },
      ])
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save attendance' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})

describe('attendance by learner grid', () => {
  it('uses the roster table, links each learner to their record, and shows notes as tooltips', () => {
    setup()
    const grid = screen.getByRole('region', { name: 'Attendance by learner' })
    const table = within(grid).getByRole('table')
    expect(table.className).toContain('dash-table')
    const ann = within(grid).getByRole('link', { name: 'Ann Able' })
    expect(ann.getAttribute('href')).toBe('/lms/cohorts/c1/learners/u1')
    expect(within(grid).getByRole('link', { name: 'Bo Baker' }).getAttribute('href')).toBe(
      '/lms/cohorts/c1/learners/u2'
    )
    const row = within(grid).getByRole('row', { name: /Ann Able/ })
    const cell = within(row).getByLabelText(/Note: Brought a guest/)
    expect(cell.getAttribute('title')).toContain('Brought a guest')
    expect(cell.className).toContain('at-has-note')
    expect(within(row).getByText('100%')).toBeTruthy()
    expect(within(grid).getByText('A')).toBeTruthy()
    expect(within(grid).getByText('L')).toBeTruthy()
  })

  it('is open with 12 sessions or fewer, folded with more, and the fold toggles', async () => {
    setup()
    const fold = screen.getByRole('button', { name: /Attendance by learner/ })
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    cleanup()
    const many = Array.from({ length: 13 }, (_, i) => mk(`m${i}`, `S ${i}`, iso(-30 + i)))
    setup(many)
    const folded = screen.getByRole('button', { name: /Attendance by learner/ })
    expect(folded.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region', { name: 'Attendance by learner' })).toBeNull()
    await userEvent.click(folded)
    expect(screen.getByRole('region', { name: 'Attendance by learner' })).toBeTruthy()
  })

  it('has one Download CSV for the whole cohort', async () => {
    setup()
    const head = screen.getByRole('button', { name: /Attendance by learner/ }).parentElement!
    await userEvent.click(within(head).getByRole('button', { name: 'Download CSV' }))
    expect(downloadFile).toHaveBeenCalledWith(
      expect.anything(),
      '/learn/cohorts/c1/attendance.csv',
      'attendance.csv'
    )
  })
})

describe('loading and errors', () => {
  it('offers a retry when the sessions fail to load', async () => {
    errors['/learn/cohorts/c1/sessions'] = new Error('x')
    render(<AttendancePanel cohortId="c1" />)
    expect(screen.getByRole('alert').textContent).toContain('Could not load the sessions')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reload).toHaveBeenCalled()
  })

  it('an empty cohort says so and Add session still works', async () => {
    loads['/learn/cohorts/c1/sessions'] = []
    loads['/learn/cohorts/c1/attendance'] = { ...summary, sessionList: [], rows: [] }
    render(<AttendancePanel cohortId="c1" />)
    expect(screen.getByText('No sessions yet')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Add session' }))
    expect((screen.getByRole('dialog').querySelector('input') as HTMLInputElement).value).toBe(
      'Session 1'
    )
  })
})
