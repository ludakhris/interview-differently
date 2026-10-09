// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ReviewSwitch } from './ReviewSwitch'

afterEach(() => {
  cleanup()
  window.history.pushState({}, '', '/')
})

const options = [
  { key: 'none', label: 'Current' },
  { key: 'a', label: 'A · Bands' },
  { key: 'b', label: 'B · Fold' },
]

describe('ReviewSwitch', () => {
  it('links every option to the same page, keeping the other query parameters', () => {
    window.history.pushState({}, '', '/lms/cohorts/k1?site=lanternhill&layout=a#h-roster')
    render(<ReviewSwitch param="layout" label="Section layout" options={options} current="a" />)
    const href = (name: string) =>
      (screen.getByRole('link', { name }) as HTMLAnchorElement).getAttribute('href')
    expect(href('B · Fold')).toBe('/lms/cohorts/k1?site=lanternhill&layout=b#h-roster')
    expect(href('Current')).toBe('/lms/cohorts/k1?site=lanternhill&layout=none#h-roster')
  })

  it('marks the option on screen, and shows the first one when the key is unknown', () => {
    const { unmount } = render(
      <ReviewSwitch param="layout" label="Section layout" options={options} current="b" />
    )
    expect(screen.getByRole('link', { name: 'B · Fold' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'A · Bands' }).getAttribute('aria-current')).toBeNull()
    unmount()
    render(<ReviewSwitch param="layout" label="Section layout" options={options} current="zzz" />)
    expect(screen.getByRole('link', { name: 'Current' }).getAttribute('aria-current')).toBe('page')
  })

  it('names what is under review', () => {
    render(<ReviewSwitch param="layout" label="Section layout" options={options} current="a" />)
    expect(screen.getByRole('navigation', { name: 'Section layout under review' })).toBeTruthy()
  })
})
