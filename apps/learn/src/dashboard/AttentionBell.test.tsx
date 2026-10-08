// @vitest-environment jsdom
import type { AttentionSummary } from '@id/types'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

let query = ''
let load: { data: AttentionSummary | null; error: Error | null } = { data: null, error: null }
const reload = vi.fn()
vi.mock('./app-context', () => ({ useApp: () => ({ query }) }))
vi.mock('./api', () => ({ useLoad: () => ({ ...load, loading: false, reload }) }))

import { AttentionBell, withVisitorContext } from './AttentionBell'

const summary: AttentionSummary = {
  total: 4,
  items: [
    {
      kind: 'join_requests',
      title: '3 people are waiting to join Electrical Fall',
      count: 3,
      href: '/lms/cohorts/c1?site=cedar-mill',
    },
    {
      kind: 'profile',
      title: 'Time to refresh your profile',
      href: '/lms/learning/profile',
    },
  ],
}

afterEach(() => {
  cleanup()
  load = { data: null, error: null }
  query = ''
  reload.mockClear()
})

describe('AttentionBell', () => {
  it('shows the count on the bell and names it for assistive technology', () => {
    load.data = summary
    render(<AttentionBell />)
    const bell = screen.getByRole('button', { name: '4 items need your attention' })
    expect(bell.textContent).toBe('4')
  })

  it('says "1 item needs" for one', () => {
    load.data = { total: 1, items: [summary.items[1]] }
    render(<AttentionBell />)
    expect(screen.getByRole('button', { name: '1 item needs your attention' })).toBeTruthy()
  })

  it('opens a list of links with their counts, and refetches on open', () => {
    load.data = summary
    render(<AttentionBell />)
    fireEvent.click(screen.getByRole('button', { name: /need your attention/ }))
    expect(screen.getByText('Needs your attention')).toBeTruthy()
    const link = screen.getByRole('link', { name: /3 people are waiting to join Electrical Fall/ })
    expect(link.getAttribute('href')).toBe('/lms/cohorts/c1?site=cedar-mill')
    expect(link.textContent).toContain('3')
    expect(
      screen.getByRole('link', { name: 'Time to refresh your profile' }).getAttribute('href')
    ).toBe('/lms/learning/profile')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and on a click outside', () => {
    load.data = summary
    render(<AttentionBell />)
    const bell = screen.getByRole('button', { name: /need your attention/ })
    fireEvent.click(bell)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Needs your attention')).toBeNull()
    expect(document.activeElement).toBe(bell)
    fireEvent.click(bell)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByText('Needs your attention')).toBeNull()
  })

  it('shows a plain bell and a caught-up message when nothing waits', () => {
    load.data = { total: 0, items: [] }
    render(<AttentionBell />)
    const bell = screen.getByRole('button', { name: 'Nothing needs your attention' })
    expect(bell.textContent).toBe('')
    fireEvent.click(bell)
    expect(screen.getByText('You’re all caught up.')).toBeTruthy()
  })

  it('renders nothing while loading or when the request failed', () => {
    const { container, rerender } = render(<AttentionBell />)
    expect(container.innerHTML).toBe('')
    load = { data: null, error: new Error('Request failed (500)') }
    rerender(<AttentionBell />)
    expect(container.innerHTML).toBe('')
  })

  it('keeps the visitor’s brand on links, without overriding a workspace the item names', () => {
    expect(withVisitorContext('/lms/admin/tools', '?site=delaware&brand=learn')).toBe(
      '/lms/admin/tools?site=delaware&brand=learn'
    )
    expect(
      withVisitorContext('/lms/cohorts/c1?site=cedar-mill', '?site=delaware&brand=learn')
    ).toBe('/lms/cohorts/c1?site=cedar-mill&brand=learn')
    expect(withVisitorContext('/lms/learning/profile', '')).toBe('/lms/learning/profile')
  })
})
