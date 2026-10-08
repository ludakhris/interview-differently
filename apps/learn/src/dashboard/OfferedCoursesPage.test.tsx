// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

let state: { data: unknown; error: Error | null; loading: boolean } = {
  data: null,
  error: null,
  loading: false,
}
const paths: string[] = []
vi.mock('./api', () => ({
  useLoad: (path: string) => {
    paths.push(path)
    return state
  },
}))
vi.mock('./app-context', () => ({
  useApp: () => ({ href: (p: string) => `${p}#ctx`, current: { name: 'Harbor Center' } }),
}))

import { OfferedCoursesPage } from './OfferedCoursesPage'

afterEach(() => {
  cleanup()
  paths.length = 0
})

describe('OfferedCoursesPage (read-only courses for an organization)', () => {
  it('explains that only providers author courses, and lists what was offered', () => {
    state = {
      data: [{ id: 'c1', title: 'Medical Assistant', provider: 'Cedar Mill', lengthWeeks: 16 }],
      error: null,
      loading: false,
    }
    render(<OfferedCoursesPage workspace="harbor" />)
    expect(paths[0]).toBe('/learn/workspaces/harbor/runnable-courses')
    expect(screen.getByText('Courses are authored by providers')).toBeTruthy()
    expect(screen.getByText(/Only training providers can create and edit courses/)).toBeTruthy()
    expect(screen.getByText('Medical Assistant')).toBeTruthy()
    expect(screen.getByText('Cedar Mill · 16 weeks')).toBeTruthy()
    // No authoring controls and no link into the course editor.
    expect(screen.queryByRole('button', { name: /new course/i })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Medical Assistant' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Cohorts' }).getAttribute('href')).toBe(
      '/lms/cohorts#ctx'
    )
  })

  it('says so when nothing has been offered yet', () => {
    state = { data: [], error: null, loading: false }
    render(<OfferedCoursesPage workspace="harbor" />)
    expect(screen.getByText('No courses offered yet')).toBeTruthy()
  })
})
