// @vitest-environment jsdom
import type { SystemStatus } from '@id/types'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

let role: string | undefined = 'admin'
let loaded: { data: SystemStatus | null; error: Error | null } = { data: null, error: null }
const paths: string[] = []
vi.mock('./api', () => ({
  useLoad: (path: string) => {
    paths.push(path)
    return { ...loaded, loading: !loaded.data && !loaded.error, reload: vi.fn() }
  },
}))
vi.mock('./app-context', () => ({ useApp: () => ({ href: (p: string) => p }) }))
vi.mock('./shared', () => ({
  errorNotice: (e: Error) => <p>Error: {e.message}</p>,
  useRole: () => role,
}))
vi.mock('./AdminPages', () => ({ SYSTEM_ADMIN: 'admin' }))

import { SystemStatusPage } from './SystemStatusPage'

const now = Date.now()
const iso = (msAgo: number) => new Date(now - msAgo).toISOString()
const HOUR = 3_600_000

type Grading = SystemStatus['simulator']['grading']
type Spark = SystemStatus['spark']

const selfTest: Grading['selfTest'] = {
  status: 'ok',
  reason: null,
  peakMb: 1024,
  limitMb: 2048,
  checkedAt: iso(60_000),
}
const quiet = () => ({
  failures: { windowHours: 24, count: 0, perHour: new Array<number>(24).fill(0), latest: [] },
  lastFailureAt: null,
})
const status = (g: Partial<Grading> = {}, sp: Partial<Spark> = {}): SystemStatus => ({
  simulator: { grading: { selfTest, ...quiet(), ...g } },
  spark: {
    setup: { status: 'ok', problems: [] },
    player: { status: 'ok', reason: null, checkedAt: iso(120_000) },
    lessons: quiet(),
    ...sp,
  },
})
const gradingFailures = (lastHour: number): Partial<Grading> => ({
  failures: {
    windowHours: 24,
    count: 3 + lastHour,
    perHour: [...new Array<number>(20).fill(0), 3, 0, 0, lastHour],
    latest: [
      { at: iso(3 * HOUR), reason: 'The practice database could not be loaded.', kind: 'infra' },
      {
        at: iso(3 * HOUR + 60_000),
        reason: 'Grading is busy. Try again in a moment.',
        kind: 'busy',
      },
    ],
  },
  lastFailureAt: iso(3 * HOUR),
})
const videoFailures = (lastHour: number): Partial<Spark> => ({
  lessons: {
    failures: {
      windowHours: 24,
      count: 1 + lastHour,
      perHour: [...new Array<number>(18).fill(0), 1, 0, 0, 0, 0, lastHour],
      latest: [
        { at: iso(5 * HOUR), reason: 'Could not write that lesson. Try again.', kind: 'no-lesson' },
      ],
    },
    lastFailureAt: iso(5 * HOUR),
  },
})

const show = (data: SystemStatus | null, error: Error | null = null) => {
  loaded = { data, error }
  return render(<SystemStatusPage />)
}
const banner = () => document.querySelector('.ss-hero') as HTMLElement
const section = (name: string) => screen.getByRole('region', { name })
const row = (name: string) =>
  screen.getByRole('heading', { level: 3, name }).closest('li') as HTMLElement

afterEach(() => {
  cleanup()
  role = 'admin'
  loaded = { data: null, error: null }
  paths.length = 0
})

describe('SystemStatusPage', () => {
  it('shows nothing of the status to anyone but a system admin', () => {
    role = 'provider-admin'
    render(<SystemStatusPage />)
    expect(screen.getByText('Your account does not have access')).toBeTruthy()
    expect(paths).toEqual([])
  })

  it('says it is checking while the status loads, and shows an error', () => {
    show(null)
    expect(paths).toEqual(['/learn/admin/status'])
    expect(screen.getByText(/Checking each product/)).toBeTruthy()
    cleanup()
    show(null, new Error('Insufficient role'))
    expect(screen.getByText('Error: Insufficient role')).toBeTruthy()
  })

  it('groups the checks by product, with all systems working', () => {
    show(status())
    expect(banner().textContent).toContain('All systems working')
    expect(banner().textContent).toContain('No failures in the last 24 hours.')
    // and under each product's recent failures
    expect(screen.getAllByText('No failures in the last 24 hours.')).toHaveLength(3)
    const sim = section('Skill Simulator')
    expect(
      within(sim)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent)
    ).toEqual([
      'Simulation scoring',
      'Simulation scoring failures',
      'Recent simulation scoring failures',
    ])
    const spark = section('Micro Learning (Spark)')
    expect(
      within(spark)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent)
    ).toEqual([
      'Video lessons',
      'Video lesson player',
      'Video lesson failures',
      'Recent video lesson failures',
    ])
    for (const name of [
      'Simulation scoring',
      'Simulation scoring failures',
      'Video lessons',
      'Video lesson player',
      'Video lesson failures',
    ])
      expect(within(row(name)).getByText('Working')).toBeTruthy()
    // no API row: it could only ever be green
    expect(screen.queryByRole('heading', { name: 'API' })).toBeNull()
    expect(
      within(row('Simulation scoring')).getByText(/1,024 MB of its 2,048 MB limit/)
    ).toBeTruthy()
    expect(within(row('Simulation scoring')).getByRole('meter').getAttribute('aria-valuenow')).toBe(
      '50'
    )
    expect(
      within(sim).getByRole('img', {
        name: 'Simulation scoring failures per hour, last 24 hours: none.',
      })
    ).toBeTruthy()
    expect(
      within(spark).getByRole('img', {
        name: 'Video lesson failures per hour, last 24 hours: none.',
      })
    ).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getAllByText('None in 30 days')).toHaveLength(2)
  })

  describe('Skill Simulator', () => {
    it('says grading is failing, with the reason, and memory it cannot read', () => {
      show(
        status({
          selfTest: {
            ...selfTest,
            status: 'failing',
            reason: 'Grading memory is low',
            peakMb: null,
          },
        })
      )
      expect(banner().textContent).toContain('Simulation scoring is failing')
      expect(within(row('Simulation scoring')).getByText('Failing')).toBeTruthy()
      expect(screen.getAllByText('Grading memory is low').length).toBe(2)
      expect(
        within(row('Simulation scoring')).getByText(/Not measured on this server/)
      ).toBeTruthy()
      expect(within(row('Simulation scoring')).queryByRole('meter')).toBeNull()
    })

    it('says grading is busy when the self-test could not run', () => {
      show(status({ selfTest: { ...selfTest, status: 'busy' } }))
      expect(banner().textContent).toContain('Grading is busy')
      expect(within(row('Simulation scoring')).getByText('Busy, not checked')).toBeTruthy()
    })

    it('lists earlier failures and blocks out the hours, while the banner stays green', () => {
      show(status(gradingFailures(0)))
      expect(banner().textContent).toContain('All systems working')
      expect(banner().textContent).toContain(
        '3 simulation scoring failures in the last 24 hours, none in the last hour.'
      )
      expect(
        within(row('Simulation scoring failures')).getByText('Failed earlier today')
      ).toBeTruthy()
      const blocks = within(row('Simulation scoring failures')).getByRole('img', {
        name: /3 in all/,
      })
      expect(blocks.children).toHaveLength(24)
      expect(blocks.querySelectorAll('.ss-seg-bad')).toHaveLength(1)
      const rows = within(
        screen.getByRole('table', { name: 'Latest simulation scoring failures' })
      ).getAllByRole('row')
      expect(rows).toHaveLength(3)
      expect(rows[1].textContent).toContain('Grading would not run')
      expect(rows[2].textContent).toContain('Grading was busy')
    })

    it('flags failures in the last hour even while the self-test works', () => {
      show(status(gradingFailures(2)))
      expect(banner().textContent).toContain(
        'Learners hit simulation scoring failures in the last hour'
      )
      expect(
        within(row('Simulation scoring failures')).getByText('Failed in the last hour')
      ).toBeTruthy()
    })

    it('says when the list is cut', () => {
      const g = gradingFailures(0)
      show(status({ ...g, failures: { ...g.failures!, count: 34 } }))
      expect(screen.getByText('Showing the newest 2 of 34.')).toBeTruthy()
    })
  })

  describe('Micro Learning', () => {
    it('says videos are not set up, naming what is missing', () => {
      show(
        status(
          {},
          {
            setup: {
              status: 'failing',
              problems: ['The video player’s web address (SPARK_WEB_URL) is not set.'],
            },
          }
        )
      )
      expect(banner().textContent).toContain('Video lessons are not set up')
      expect(within(row('Video lessons')).getByText('Not set up')).toBeTruthy()
      expect(
        within(row('Video lessons')).getByText(
          'The video player’s web address (SPARK_WEB_URL) is not set.'
        )
      ).toBeTruthy()
    })

    it('says the player is failing, with the reason', () => {
      show(
        status(
          {},
          {
            player: {
              status: 'failing',
              reason: 'The video lesson player answered 502.',
              checkedAt: iso(60_000),
            },
          }
        )
      )
      expect(banner().textContent).toContain('The video lesson player is not answering')
      expect(within(row('Video lesson player')).getByText('Failing')).toBeTruthy()
      expect(
        within(row('Video lesson player')).getByText('The video lesson player answered 502.')
      ).toBeTruthy()
    })

    it('warns when there is no player address to check', () => {
      show(status({}, { player: { status: 'not-set-up', reason: null, checkedAt: iso(0) } }))
      expect(banner().textContent).toContain('The video lesson player is not set up')
      expect(banner().textContent).toContain('There is no player address (SPARK_WEB_URL) to check.')
      expect(within(row('Video lesson player')).getByText('Not set up')).toBeTruthy()
    })

    it('lists lessons learners could not get, and flags the last hour', () => {
      show(status({}, videoFailures(1)))
      expect(banner().textContent).toContain(
        'Learners could not get video lessons in the last hour'
      )
      expect(within(row('Video lesson failures')).getByText('Failed in the last hour')).toBeTruthy()
      const rows = within(
        screen.getByRole('table', { name: 'Latest video lesson failures' })
      ).getAllByRole('row')
      expect(rows[1].textContent).toContain('No usable video was written')
      expect(rows[1].textContent).toContain('Could not write that lesson. Try again.')
    })
  })

  it('leads with the worst problem across both products, and counts the rest', () => {
    show(
      status(
        { selfTest: { ...selfTest, status: 'busy' } },
        { player: { status: 'failing', reason: 'boom', checkedAt: iso(0) } }
      )
    )
    // the player failing is worse than grading being busy, though grading comes first on the page
    expect(banner().textContent).toContain('The video lesson player is not answering')
    expect(screen.getByText('boom 1 more problem below.')).toBeTruthy()
    expect(section('Skill Simulator')).toBeTruthy()
  })
})
