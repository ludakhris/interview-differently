// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StaffAttempts, YourAttempts } from './AttemptsList'
import type { AttemptLogEntry } from './attemptsText'

afterEach(cleanup)

const at = (i: number): AttemptLogEntry => ({
  score: 50 + i,
  at: `2026-10-0${(i % 9) + 1}T12:00:00Z`,
  best: i === 0,
  passed: i === 0,
})

describe('YourAttempts', () => {
  it('renders nothing without a log or earlier attempts', () => {
    const { container } = render(<YourAttempts attempts={[]} attemptsBeforeLog={0} />)
    expect(container.innerHTML).toBe('')
    cleanup()
    const again = render(<YourAttempts />)
    expect(again.container.innerHTML).toBe('')
  })

  it('is closed until opened, and the heading carries the total (recorded plus earlier)', async () => {
    const { container } = render(
      <YourAttempts
        attempts={[{ score: 82, at: '2026-10-07T12:00:00Z', best: true, passed: true }]}
        attemptsBeforeLog={2}
      />
    )
    const details = container.querySelector('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    const summary = screen.getByText('Your attempts (3)')
    await userEvent.click(summary)
    expect(details.open).toBe(true)
  })

  it('lists attempts with a Best chip and pass wording', () => {
    render(
      <YourAttempts
        attempts={[
          { score: 82, at: '2026-10-07T12:00:00Z', best: true, passed: true },
          { score: 59, at: '2026-10-06T12:00:00Z', best: false, passed: false },
        ]}
      />
    )
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('82%')
    expect(within(items[0]).getByText('Best')).toBeTruthy()
    expect(items[0].textContent).toContain('Passed')
    expect(items[1].textContent).toContain('Below the pass mark')
    expect(within(items[1]).queryByText('Best')).toBeNull()
  })

  it('omits pass wording when passed is null', () => {
    render(
      <YourAttempts
        attempts={[{ score: 70, at: '2026-10-07T12:00:00Z', best: true, passed: null }]}
      />
    )
    expect(screen.queryByText('Passed')).toBeNull()
    expect(screen.queryByText('Below the pass mark')).toBeNull()
  })

  it('shows the earlier-not-recorded line, alone or with a list', () => {
    render(<YourAttempts attempts={[]} attemptsBeforeLog={3} />)
    expect(
      screen.getByText('3 earlier attempts were not recorded, only your best score was kept.')
    ).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('collapses past five and shows all on request', async () => {
    render(<YourAttempts attempts={Array.from({ length: 7 }, (_, i) => at(i))} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    const btn = screen.getByRole('button', { name: 'Show all 7' })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(btn)
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    await userEvent.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })

  it('has no show-all button at five or fewer', () => {
    render(<YourAttempts attempts={Array.from({ length: 5 }, (_, i) => at(i))} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('StaffAttempts', () => {
  const noop = () => {}
  it('shows loading', () => {
    render(<StaffAttempts state={{ loading: true, error: null, data: null }} onRetry={noop} />)
    expect(screen.getByText('Loading attempts…')).toBeTruthy()
  })

  it('shows empty', () => {
    render(
      <StaffAttempts
        state={{ loading: false, error: null, data: { attempts: [], attemptsBeforeLog: 0 } }}
        onRetry={noop}
      />
    )
    expect(screen.getByText('No attempts recorded for this item.')).toBeTruthy()
  })

  it('shows the list with staff wording', () => {
    render(
      <StaffAttempts
        state={{
          loading: false,
          error: null,
          data: { attempts: [at(0)], attemptsBeforeLog: 2 },
        }}
        onRetry={noop}
      />
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(
      screen.getByText('2 earlier attempts were not recorded, only the best score was kept.')
    ).toBeTruthy()
  })

  it('shows the error with a working retry', async () => {
    const retry = vi.fn()
    render(
      <StaffAttempts
        state={{ loading: false, error: new Error('Forbidden'), data: null }}
        onRetry={retry}
      />
    )
    expect(screen.getByRole('alert').textContent).toContain('Forbidden')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
