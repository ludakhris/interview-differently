// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AdaptiveSyncResult } from '@id/types'
import { useState } from 'react'
import { PlanChangeOverlay } from './PlanChangeOverlay'

afterEach(cleanup)

const result: AdaptiveSyncResult = {
  completed: false,
  at: '2026-10-15T10:00:00.000Z',
  planAdded: [],
  planSkipped: [{ itemId: 'i1', title: 'Filtering rows', skill: 'WHERE' }],
}

function Harness() {
  const [open, setOpen] = useState(false)
  const [, setTick] = useState(0)
  return (
    <div>
      <button onClick={() => setOpen(true)}>Checkpoint frame</button>
      <p data-testid="behind">The course page</p>
      <div>
        {/* A new onClose on every render, as a parent might pass. */}
        {open && (
          <PlanChangeOverlay result={result} courseHref="/path" onClose={() => setOpen(false)} />
        )}
        <button onClick={() => setTick((n) => n + 1)}>Rerender</button>
      </div>
    </div>
  )
}

describe('PlanChangeOverlay', () => {
  it('focuses Keep working once, not again when the parent re-renders', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Checkpoint frame' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep working' }))
    const link = screen.getByRole('link', { name: 'See my updated path' })
    link.focus()
    // The page behind is inert, so this is a re-render from outside, not a click the learner can make.
    screen.getByRole('button', { name: 'Rerender', hidden: true }).click()
    expect(document.activeElement).toBe(link)
  })

  it('makes the page behind inert while open and traps Tab inside', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Checkpoint frame' }))
    expect(screen.getByTestId('behind').hasAttribute('inert')).toBe(true)
    expect(screen.getByRole('dialog').closest('[inert]')).toBeNull()
    const keep = screen.getByRole('button', { name: 'Keep working' })
    const link = screen.getByRole('link', { name: 'See my updated path' })
    await userEvent.tab()
    expect(document.activeElement).toBe(link)
    await userEvent.tab()
    expect(document.activeElement).toBe(keep)
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(link)
  })

  it('Esc closes, the page is no longer inert and focus returns to the opener', async () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Checkpoint frame' })
    await userEvent.click(opener)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('[inert]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})
