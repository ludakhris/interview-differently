// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { forwardRef } from 'react'
import type { CheckpointAnswerResult, CheckpointRun, CheckpointView } from '@id/types'
import { CheckpointChat } from './CheckpointChat'
import { CheckpointError } from '@/services/checkpointService'

// CodeMirror needs layout jsdom does not have; a textarea stands in for the editor.
vi.mock('@/components/sql/SqlEditor', () => ({
  SqlEditor: forwardRef<HTMLTextAreaElement, { value: string; onChange: (v: string) => void }>(
    function SqlEditor({ value, onChange }, ref) {
      return (
        <textarea
          ref={ref}
          aria-label="SQL"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    }
  ),
}))

const client = {
  view: vi.fn(),
  answer: vi.fn(),
  run: vi.fn(),
  help: vi.fn(),
  practice: vi.fn(),
}

const base: CheckpointView = {
  deliveryId: 'd1',
  title: 'First morning',
  scenario: 'Your first morning on the data team',
  diagnostic: true,
  oneAnswer: true,
  schema: [{ table: 'orders', columns: [{ name: 'id', type: 'int' }], rowCount: 10 }],
  tasks: [
    {
      ref: 'a',
      prompt: 'How many orders?',
      from: 'Priya, Marketing',
      starterSql: 'SELECT count(*) FROM orders',
      expected: { columns: ['count'], rowCount: 1 },
    },
    { ref: 'b', prompt: 'Orders by region?', from: 'Sam Lee', starterSql: null, expected: null },
  ],
  answers: {},
  practice: null,
  done: false,
  scorePct: null,
}

const settled = (over: Partial<CheckpointView['answers'][string]> = {}) => ({
  correct: false,
  passed: false,
  sql: 'SELECT count(*) FROM orders',
  preview: null,
  reason: null,
  error: null,
  tries: 1,
  helps: 0,
  ...over,
})

function setup(view: CheckpointView = base, framed = true, standalone = false) {
  const onView = vi.fn()
  const onSessionEnded = vi.fn()
  const utils = render(
    <CheckpointChat
      view={view}
      client={client}
      framed={framed}
      standalone={standalone}
      onView={onView}
      onSessionEnded={onSessionEnded}
    />
  )
  return { ...utils, onView, onSessionEnded }
}

const parentPost = vi.fn()

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Object.values(client).forEach((f) => f.mockReset())
  parentPost.mockReset()
  // jsdom's window is its own parent; pretend to be framed by the LMS page.
  vi.spyOn(window, 'parent', 'get').mockReturnValue({
    postMessage: parentPost,
  } as unknown as Window)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CheckpointChat', () => {
  it('shows one request at a time, opening with the scenario', async () => {
    setup()
    expect(screen.getByText('Your first morning on the data team')).toBeTruthy()
    expect(await screen.findByText('How many orders?', {}, { timeout: 2000 })).toBeTruthy()
    expect(screen.queryByText('Orders by region?')).toBeNull()
    expect(screen.getByText('0 of 2 answered')).toBeTruthy()
  })

  it('moves on after a right answer and tells the LMS page', async () => {
    const after: CheckpointView = { ...base, answers: { a: settled({ correct: true }) } }
    client.answer.mockResolvedValue({
      correct: true,
      reason: null,
      error: null,
      preview: null,
      view: after,
    } satisfies CheckpointAnswerResult)
    const { onView, rerender } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Send to Priya' }))
    await vi.waitFor(() => expect(onView).toHaveBeenCalledWith(after))
    expect(client.answer).toHaveBeenCalledWith({
      ref: 'a',
      sql: 'SELECT count(*) FROM orders',
    })
    expect(parentPost).toHaveBeenCalledWith(
      { subject: 'id.checkpoint.answered', ref: 'a', done: false },
      '*'
    )
    rerender(
      <CheckpointChat
        view={after}
        client={client}
        framed
        onView={onView}
        onSessionEnded={vi.fn()}
      />
    )
    expect(await screen.findByText('Orders by region?', {}, { timeout: 2000 })).toBeTruthy()
    expect(screen.getByText('Perfect, that is exactly it. Thanks!')).toBeTruthy()
  })

  const miss = (view: CheckpointView): CheckpointAnswerResult => ({
    correct: false,
    reason: 'One row too many',
    error: null,
    preview: null,
    view: { ...view, answers: { a: settled({ reason: 'One row too many' }) } },
  })

  it('keeps a missed request open to try again or move on', async () => {
    const practice = { ...base, diagnostic: false, oneAnswer: false }
    client.answer.mockResolvedValue(miss(practice))
    setup(practice)
    fireEvent.click(screen.getByRole('button', { name: 'Send to Priya' }))
    expect(await screen.findByText(/Hmm, not quite. One row too many/)).toBeTruthy()
    const tryAgain = screen.getByRole('button', { name: 'Try again' })
    expect(screen.getByRole('button', { name: 'Move on' })).toBeTruthy()
    // Focus goes to the next action, and the miss is announced in one short line.
    expect(document.activeElement).toBe(tryAgain)
    expect(screen.getByRole('status').textContent).toBe('Not quite: One row too many')
  })

  it('takes one answer per request in a diagnostic: after a miss the colleague moves on', async () => {
    const { rerender, onView } = setup()
    client.answer.mockResolvedValue(miss(base))
    fireEvent.click(screen.getByRole('button', { name: 'Send to Priya' }))
    await vi.waitFor(() => expect(onView).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move on' })).toBeNull()
    const after = onView.mock.calls[0]![0] as CheckpointView
    rerender(
      <CheckpointChat
        view={after}
        client={client}
        framed
        onView={onView}
        onSessionEnded={vi.fn()}
      />
    )
    // Someone else had the data: no blame, and the next request arrives as usual.
    expect(
      screen.getByText(
        "That didn't look right, but we got the data from Maya, who already had it. Thanks anyway!"
      )
    ).toBeTruthy()
    expect(await screen.findByText('Orders by region?', {}, { timeout: 2000 })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send to Sam' })).toBeTruthy()
    expect(client.answer).toHaveBeenCalledTimes(1)
  })

  it('takes one answer per request in a work simulation: Run stays, no pass, and after a miss the colleague moves on', async () => {
    const sim = { ...base, diagnostic: false, oneAnswer: true }
    client.run.mockResolvedValue({
      preview: { columns: ['count'], rows: [[3]], rowCount: 1 },
      error: null,
      check: null,
    } satisfies CheckpointRun)
    const { rerender, onView } = setup(sim, false, true)
    expect(screen.queryByRole('button', { name: 'Not learned this yet: pass' })).toBeNull()
    // Running is not sending: the learner can run as often as they like before they send.
    for (const n of [1, 2]) {
      fireEvent.click(screen.getByRole('button', { name: /^Run/ }))
      await vi.waitFor(() => expect(client.run).toHaveBeenCalledTimes(n))
      expect(await screen.findByText(/Your result: 1 row/)).toBeTruthy()
    }
    expect(client.answer).not.toHaveBeenCalled()
    client.answer.mockResolvedValue(miss(sim))
    fireEvent.click(screen.getByRole('button', { name: 'Send to Priya' }))
    await vi.waitFor(() => expect(onView).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move on' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Next request/ })).toBeNull()
    const after = onView.mock.calls[0]![0] as CheckpointView
    rerender(
      <CheckpointChat
        view={after}
        client={client}
        framed={false}
        standalone
        onView={onView}
        onSessionEnded={vi.fn()}
      />
    )
    expect(screen.getByText(/That didn't look right, but we got the data from Maya/)).toBeTruthy()
    expect(await screen.findByText('Orders by region?', {}, { timeout: 2000 })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send to Sam' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(client.answer).toHaveBeenCalledTimes(1)
  })

  it('a right answer in a work simulation moves on too, with the colleague thanking them', async () => {
    const sim = { ...base, diagnostic: false, oneAnswer: true }
    const { rerender, onView } = setup(sim, false, true)
    client.answer.mockResolvedValue({
      correct: true,
      reason: null,
      error: null,
      preview: null,
      view: { ...sim, answers: { a: settled({ correct: true }) } },
    } satisfies CheckpointAnswerResult)
    fireEvent.click(screen.getByRole('button', { name: 'Send to Priya' }))
    await vi.waitFor(() => expect(onView).toHaveBeenCalled())
    rerender(
      <CheckpointChat
        view={onView.mock.calls[0]![0] as CheckpointView}
        client={client}
        framed={false}
        standalone
        onView={onView}
        onSessionEnded={vi.fn()}
      />
    )
    expect(screen.getByText('Perfect, that is exactly it. Thanks!')).toBeTruthy()
    expect(await screen.findByText('Orders by region?', {}, { timeout: 2000 })).toBeTruthy()
  })

  it('outside a diagnostic, the soft move-on comes once the learner moves on', async () => {
    const practice = { ...base, diagnostic: false, oneAnswer: false }
    const { rerender, onView } = setup(practice)
    client.answer.mockResolvedValue(miss(practice))
    fireEvent.click(screen.getByRole('button', { name: 'Send to Priya' }))
    await vi.waitFor(() => expect(onView).toHaveBeenCalled())
    const after = onView.mock.calls[0]![0] as CheckpointView
    rerender(
      <CheckpointChat
        view={after}
        client={client}
        framed
        onView={onView}
        onSessionEnded={vi.fn()}
      />
    )
    // While they decide, the workbench speaks for Priya; the thread does not answer yet.
    expect(screen.queryByText(/we got the data from/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Move on' }))
    expect(screen.getByText(/That didn't look right, but we got the data from Maya/)).toBeTruthy()
    expect(await screen.findByText('Orders by region?', {}, { timeout: 2000 })).toBeTruthy()
  })

  it('replies with the result table, not the SQL; the query is one click away', () => {
    const rows = [
      ['north', 4],
      ['south', 3],
      ['east', null],
      ['west', 1],
    ]
    setup({
      ...base,
      answers: {
        a: settled({
          correct: true,
          sql: 'SELECT region, n FROM orders',
          preview: { columns: ['region', 'n'], rows, rowCount: 12 },
        }),
      },
    })
    const reply = screen.getByText('✓ Right').closest('div')!
    const table = within(reply).getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent)
    ).toEqual(['region', 'n'])
    // the first few rows and how many there were
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    expect(within(table).getByText('null')).toBeTruthy()
    expect(within(reply).getByText('12 rows · first 3 shown')).toBeTruthy()
    expect(screen.queryByText('SELECT region, n FROM orders')).toBeNull()
    const toggle = within(reply).getByRole('button', { name: 'Show query' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByText('SELECT region, n FROM orders')).toBeTruthy()
    expect(within(reply).getByRole('button', { name: 'Hide query' })).toBeTruthy()
    expect(screen.getByText('Perfect, that is exactly it. Thanks!')).toBeTruthy()
  })

  it('says so when the sent query did not run, and keeps a pass in words', () => {
    setup({
      ...base,
      answers: {
        a: settled({ error: 'syntax error', sql: 'SELEC 1' }),
        b: settled({ passed: true, sql: null, tries: 0 }),
      },
    })
    expect(screen.getByText('My query did not run.')).toBeTruthy()
    expect(screen.getByText('I have not learned this one yet.')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Show query' })).toHaveLength(1)
  })

  it('cannot move on or try again while a request is in flight', async () => {
    const practice = { ...base, diagnostic: false, oneAnswer: false }
    client.answer.mockResolvedValue(miss(practice))
    setup(practice)
    fireEvent.click(screen.getByRole('button', { name: 'Send to Priya' }))
    await screen.findByRole('button', { name: 'Try again' })
    let finish: (r: CheckpointRun) => void = () => {}
    client.run.mockReturnValue(new Promise<CheckpointRun>((r) => (finish = r)))
    fireEvent.click(screen.getByRole('button', { name: /^Run/ }))
    expect(screen.getByRole('button', { name: 'Try again' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Move on' }).hasAttribute('disabled')).toBe(true)
    await act(async () => finish({ preview: null, error: 'syntax error', check: null }))
    expect(screen.getByRole('button', { name: 'Move on' }).hasAttribute('disabled')).toBe(false)
  })

  it('counts right rows over the rows on screen only', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => [i])
    // 79 rows back, 8 on screen with 3 of them right; the rest of the marks must not count.
    const rowHits = Array.from({ length: 79 }, (_, i) => i < 3 || i > 20)
    client.run.mockResolvedValue({
      preview: { columns: ['count'], rows, rowCount: 79 },
      error: null,
      check: {
        correct: false,
        reason: null,
        rowHits,
        expected: { columns: ['count'], rowCount: 1 },
      },
    } satisfies CheckpointRun)
    const { container } = setup({
      ...base,
      tasks: [{ ...base.tasks[0]!, expected: { columns: ['count'], rowCount: 12 } }],
    })
    fireEvent.click(screen.getByRole('button', { name: /^Run/ }))
    expect(await screen.findByText(/3 of the first 8 are what Priya needs/)).toBeTruthy()
    expect(container.querySelectorAll('.bg-emerald-400')).toHaveLength(3)
    expect(screen.getByRole('status').textContent).toBe('79 rows, 3 of the first 8 right')
  })

  it('never counts more marks than rows shown', async () => {
    client.run.mockResolvedValue({
      preview: { columns: ['count'], rows: [[1], [2]], rowCount: 2 },
      error: null,
      check: {
        correct: false,
        reason: null,
        rowHits: [true, false, true, true],
        expected: { columns: ['count'], rowCount: 1 },
      },
    } satisfies CheckpointRun)
    setup()
    fireEvent.click(screen.getByRole('button', { name: /^Run/ }))
    expect(await screen.findByText(/1 of the first 2 are what Priya needs/)).toBeTruthy()
  })

  it('marks each wanted column by name, ignoring case', async () => {
    const view = {
      ...base,
      tasks: [{ ...base.tasks[0]!, expected: { columns: ['region', 'total'], rowCount: 1 } }],
    }
    const check = {
      correct: false,
      reason: null,
      rowHits: [false],
      expected: view.tasks[0]!.expected,
    }
    client.run.mockResolvedValue({
      preview: { columns: ['REGION', 'n'], rows: [['x', 1]], rowCount: 1 },
      error: null,
      check,
    } satisfies CheckpointRun)
    setup(view)
    const chip = (name: string) => screen.getByText(name, { selector: '[data-present], span' })
    expect(chip('region').getAttribute('data-present')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Run/ }))
    await screen.findByText(/Your result/)
    expect(chip('region').getAttribute('data-present')).toBe('true')
    expect(chip('total').getAttribute('data-present')).toBe('false')
  })

  it('announces a short summary, not the grid or the coach', async () => {
    client.run.mockResolvedValue({
      preview: { columns: ['count'], rows: [[3]], rowCount: 1 },
      error: null,
      check: null,
    } satisfies CheckpointRun)
    client.help.mockResolvedValue({
      kind: 'hint',
      text: 'Count the rows in orders.',
      exampleSql: null,
      source: 'rules',
    })
    setup()
    fireEvent.click(screen.getByRole('button', { name: /^Run/ }))
    await screen.findByText(/Your result/)
    const workbench = screen.getByRole('region', { name: /Workbench/ })
    const live = within(workbench).getAllByRole('status')
    expect(live).toHaveLength(1)
    expect(live[0]!.textContent).toBe('1 row')
    expect(live[0]!.contains(screen.getByRole('table'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }))
    expect(await screen.findByText('Count the rows in orders.')).toBeTruthy()
    expect(within(workbench).getByRole('status').textContent).toBe('Hint ready below')
  })

  it('says so when the checkpoint has no requests', () => {
    setup({ ...base, tasks: [] })
    expect(
      screen.getByText('This checkpoint has no requests yet. Tell your instructor.')
    ).toBeTruthy()
    expect(screen.queryByText(/Finishing up/)).toBeNull()
  })

  it('offers the pass only in a diagnostic', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Not learned this yet: pass' })).toBeTruthy()
    cleanup()
    setup({ ...base, diagnostic: false, oneAnswer: false })
    expect(screen.queryByRole('button', { name: 'Not learned this yet: pass' })).toBeNull()
  })

  it('says when grading is down and retries', async () => {
    client.run.mockRejectedValueOnce(new CheckpointError(503, 'down'))
    client.run.mockResolvedValueOnce({
      preview: { columns: ['count'], rows: [[3]], rowCount: 1 },
      error: null,
      check: {
        correct: true,
        reason: null,
        rowHits: [true],
        expected: { columns: ['count'], rowCount: 1 },
      },
    })
    setup()
    fireEvent.click(screen.getByRole('button', { name: /^Run/ }))
    expect(await screen.findByText(/Grading is unavailable right now/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/✓ matches/)).toBeTruthy()
    expect(client.run).toHaveBeenCalledTimes(2)
  })

  it('hands an ended session to the page', async () => {
    client.answer.mockRejectedValue(new CheckpointError(401, 'expired'))
    const { onSessionEnded } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Not learned this yet: pass' }))
    await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalled())
  })

  it('wraps up when everything is answered', () => {
    setup({
      ...base,
      done: true,
      answers: { a: settled({ correct: true }), b: settled({ passed: true, sql: null, tries: 0 }) },
    })
    expect(screen.getByText(/everything for now. Your course has been updated./)).toBeTruthy()
    expect(screen.queryByRole('region', { name: /Workbench/ })).toBeNull()
  })

  it('in standalone Interview Differently, wraps up with the score instead of the course', () => {
    setup(
      {
        ...base,
        diagnostic: false,
        oneAnswer: true,
        done: true,
        scorePct: 50,
        answers: { a: settled({ correct: true }), b: settled() },
      },
      false,
      true
    )
    expect(screen.getByText('That’s everything for now. You got 1 of 2 right (50%).')).toBeTruthy()
    expect(screen.queryByText(/Your course/)).toBeNull()
  })

  it('posts nothing when the page is not framed', async () => {
    vi.spyOn(window, 'parent', 'get').mockReturnValue(window)
    client.answer.mockResolvedValue({
      correct: true,
      reason: null,
      error: null,
      preview: null,
      view: { ...base, answers: { a: settled({ correct: true }) } },
    } satisfies CheckpointAnswerResult)
    const { onView } = setup(base, false)
    fireEvent.click(screen.getByRole('button', { name: 'Send to Priya' }))
    await vi.waitFor(() => expect(onView).toHaveBeenCalled())
    expect(parentPost).not.toHaveBeenCalled()
  })
})
