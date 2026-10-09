// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { CohortJumpBar } from './CohortJumpBar'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

/** A heading at a given distance from the top of the screen (jsdom has no layout). */
function heading(id: string, top: number) {
  const h = document.createElement('h2')
  h.id = id
  h.getBoundingClientRect = () => ({ top }) as DOMRect
  document.body.appendChild(h)
}

describe('CohortJumpBar', () => {
  it('lists only the sections on the page, in order', () => {
    heading('h-assessments', 900)
    heading('h-roster', 1800) // an online cohort: no attendance
    render(<CohortJumpBar />)
    const links = screen.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['Assessments', '#h-assessments'],
      ['Roster', '#h-roster'],
    ])
  })

  it('shows nothing when there is nothing to jump to', () => {
    const { container } = render(<CohortJumpBar />)
    expect(container.textContent).toBe('')
  })

  it('marks the last section whose heading has reached the upper part of the screen', () => {
    heading('h-assessments', 900)
    heading('h-roster', 1800)
    window.innerHeight = 800
    render(<CohortJumpBar />)
    // nothing has reached the top yet: the first section is the one being read
    expect(screen.getByRole('link', { name: 'Assessments' }).getAttribute('aria-current')).toBe(
      'location'
    )
    document.getElementById('h-assessments')!.getBoundingClientRect = () =>
      ({ top: -300 }) as DOMRect
    document.getElementById('h-roster')!.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(screen.getByRole('link', { name: 'Roster' }).getAttribute('aria-current')).toBe(
      'location'
    )
    expect(
      screen.getByRole('link', { name: 'Assessments' }).getAttribute('aria-current')
    ).toBeNull()
  })
})
