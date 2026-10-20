// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const course = (over: object) => ({
  id: 'c1',
  title: 'Medical Billing and Coding',
  summary: 'Billing and coding.',
  sector: 'Healthcare',
  credential: 'NHA CBCS',
  lengthWeeks: 26,
  provider: 'DSU ACE',
  outcomes: ['Code diagnoses'],
  targetRoles: ['Medical coder'],
  nextStart: null,
  openCohorts: 1,
  tuitionDollars: 3285,
  contactHours: 375,
  format: 'Online, self-paced',
  prerequisite: 'High school diploma or GED',
  acceptsRequests: true,
  ...over,
})
let data: unknown = null
const paths: string[] = []
vi.mock('../../public-api', () => ({
  usePublic: (path: string) => {
    paths.push(path)
    return { data, error: null, loading: false }
  },
}))

import { DsuSite } from './DsuSite'

afterEach(() => {
  cleanup()
  paths.length = 0
})

describe('DSU demonstration site (#124)', () => {
  it('always says it is a demonstration and links back to desu.edu', () => {
    data = []
    render(<DsuSite pathname="/" />)
    expect(screen.getByRole('note').textContent).toMatch(/not an official Delaware State/)
    expect(
      screen.getByRole('link', { name: /real Adult & Continuing Education page/ })
    ).toHaveProperty('href', 'https://www.desu.edu/academics/adultcontinuing-education')
  })

  it('lists programs with hours, format and tuition, and filters by area', () => {
    data = [
      course({}),
      course({ id: 'c2', title: 'Paralegal', sector: 'Professional and Business' }),
    ]
    render(<DsuSite pathname="/" />)
    expect(paths[0]).toBe('/learn/public/dsu/catalog')
    expect(screen.getAllByText('6 months · 375 hours · Online, self-paced · $3,285')).toHaveLength(
      2
    )
    fireEvent.click(screen.getAllByRole('button', { name: /Healthcare/ })[0])
    expect(screen.queryByRole('link', { name: 'Paralegal' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Medical Billing and Coding' })).toBeTruthy()
  })

  it('offers the request button only when the program takes requests', () => {
    data = course({})
    render(<DsuSite pathname="/lms/catalog/c1" />)
    expect(screen.getByRole('link', { name: 'Request enrollment' })).toHaveProperty(
      'href',
      expect.stringContaining('/lms/catalog/c1/request')
    )
    cleanup()
    data = course({ acceptsRequests: false })
    render(<DsuSite pathname="/lms/catalog/c1" />)
    expect(screen.queryByRole('link', { name: 'Request enrollment' })).toBeNull()
  })
})
