// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CohortActivityReport, LearnerActivityReport } from '@id/types'

const loads: Record<string, unknown> = {}
const downloads: string[] = []
vi.mock('../api', () => ({
  useApiFetch: () => vi.fn(),
  downloadFile: async (_f: unknown, path: string) => {
    downloads.push(path)
  },
  useLoad: (path: string | null) => ({
    data: path ? (loads[path.replace(/\?.*/, '')] ?? null) : null,
    error: null,
    loading: false,
    reload: vi.fn(),
  }),
}))
vi.mock('../app-context', () => ({ useApp: () => ({ href: (p: string) => p }) }))
vi.mock('../shared', () => ({ errorNotice: () => <p>error</p> }))

import { ActivityPage, CohortView, DailyBars, LearnerLog } from './ActivityPage'

afterEach(() => {
  cleanup()
  downloads.length = 0
  for (const k of Object.keys(loads)) delete loads[k]
})

const cohort: CohortActivityReport = {
  cohortId: 'c1',
  from: '2026-10-05',
  to: '2026-10-07',
  tz: 'America/New_York',
  totalSeconds: 4500,
  averages: {
    perLearnerSeconds: 2250,
    perActiveLearnerSeconds: 2250,
    perActiveDaySeconds: 1500,
    activeLearners: 2,
    learnersPerDay: 1.0,
  },
  days: [
    { day: '2026-10-05', seconds: 1800, learners: 1 },
    { day: '2026-10-06', seconds: 0, learners: 0 },
    { day: '2026-10-07', seconds: 2700, learners: 2 },
  ],
  learners: [
    {
      userId: 'u1',
      name: 'Ann Lee',
      totalSeconds: 3600,
      activeDays: 2,
      averagePerActiveDaySeconds: 1800,
      firstSeenAt: '2026-10-05T10:00:00.000Z',
      lastSeenAt: '2026-10-08T03:30:00.000Z',
    },
    {
      userId: 'u2',
      name: 'Bo Quiet',
      totalSeconds: 900,
      activeDays: 1,
      averagePerActiveDaySeconds: 900,
      firstSeenAt: null,
      lastSeenAt: null,
    },
  ],
  items: [{ itemId: 'i1', title: 'Intro', seconds: 4500, learners: 2 }],
}

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

describe('CohortView', () => {
  it('shows the averages first, then a table with a name link and the daily log button', async () => {
    const pick = vi.fn()
    render(<CohortView report={cohort} tz="America/New_York" onPick={pick} />)
    const tiles = within(screen.getByRole('region', { name: 'Totals' }))
    const labels = [...document.querySelectorAll('.dash-tile-label')].map((e) => e.textContent)
    expect(labels).toEqual([
      'Average per learner',
      'Average per active day',
      'Active learners',
      'Total time',
    ])
    expect(tiles.getByText('38 min')).toBeTruthy() // 2250 s per learner
    expect(tiles.getByText('25 min')).toBeTruthy() // 1500 s per active day
    expect(tiles.getByText('2 of 2')).toBeTruthy()
    expect(tiles.getByText('1 per day on average')).toBeTruthy()
    const text = document.body.textContent!
    expect(text).not.toMatch(/measured|estimated|grant/i)

    const table = screen.getByRole('table', { name: /time spent per learner/i })
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
    expect(headers).toEqual([
      'Learner',
      'Total',
      'Average per active day',
      'Days active',
      'Last active',
      'Daily log',
    ])
    const ann = within(table).getByRole('row', { name: /Ann Lee/ })
    expect(
      within(ann)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['1 h 00 min', '30 min', '2', 'Oct 7, 11:30 PM', 'Daily log'])
    // The name goes to the learner's record page.
    expect(within(table).getByRole('link', { name: 'Ann Lee' }).getAttribute('href')).toBe(
      '/lms/cohorts/c1/learners/u1'
    )
    const bo = within(table).getByRole('row', { name: /Bo Quiet/ })
    expect(
      within(bo)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['15 min', '15 min', '1', '—', 'Daily log'])
    await userEvent.click(within(table).getByRole('button', { name: 'Daily log for Ann Lee' }))
    expect(pick).toHaveBeenCalledWith('u1', 'Ann Lee')
  })

  it('says so when there is no activity', () => {
    render(
      <CohortView report={{ ...cohort, totalSeconds: 0, learners: [] }} tz="UTC" onPick={vi.fn()} />
    )
    expect(screen.getByText(/no activity was recorded/i)).toBeTruthy()
  })
})

describe('DailyBars', () => {
  it('has a text alternative and a table of the same figures', () => {
    render(<DailyBars days={cohort.days} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Most: 45 min/)
    expect(screen.getByText(/show the daily figures as a table/i)).toBeTruthy()
    expect(screen.getAllByRole('row')).toHaveLength(4)
    const first = screen.getAllByRole('row')[1]
    expect(
      within(first)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['30 min'])
  })
})

describe('LearnerLog', () => {
  const report: LearnerActivityReport = {
    cohortId: 'c1',
    userId: 'u1',
    name: 'Ann Lee',
    from: '2026-10-05',
    to: '2026-10-07',
    tz: 'America/New_York',
    totalSeconds: 3600,
    activeDays: 1,
    averagePerActiveDaySeconds: 3600,
    days: [
      {
        day: '2026-10-05',
        seconds: 3600,
        firstSeenAt: '2026-10-05T14:00:00.000Z',
        lastSeenAt: '2026-10-05T16:20:00.000Z',
        sessionCount: 2,
        sessions: [
          { startedAt: '2026-10-05T14:00:00.000Z', seconds: 2400, itemId: 'i1', title: 'Intro' },
          { startedAt: '2026-10-05T16:00:00.000Z', seconds: 1200, itemId: 'i2', title: 'Lab tool' },
        ],
      },
    ],
  }
  it('shows a daily table in local time and sessions on demand', async () => {
    render(<LearnerLog report={report} tz="America/New_York" />)
    const row = screen.getAllByRole('row')[1]
    expect(
      within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['10:00 AM', '12:20 PM', '1 h 00 min', expect.stringMatching(/^2 sessions/)])
    expect(screen.queryByText(/Lab tool/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /2 sessions/ }))
    expect(screen.getByText('10:00 AM, 40 min: Intro')).toBeTruthy()
    expect(screen.getByText('12:00 PM, 20 min: Lab tool')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/estimated|measured/i)
  })
  it('shows the same instant in another timezone', () => {
    render(<LearnerLog report={report} tz="Asia/Kolkata" />)
    expect(screen.getByText('7:30 PM')).toBeTruthy() // 14:00 UTC
  })
  it('handles a learner with no activity', () => {
    render(<LearnerLog report={{ ...report, days: [], totalSeconds: 0, activeDays: 0 }} tz="UTC" />)
    expect(document.activeElement?.tagName).toBe('H2')
    expect(screen.getByText(/no activity was recorded for this learner/i)).toBeTruthy()
  })
})

describe('ActivityPage', () => {
  it('lists cohorts when none is chosen', () => {
    loads['/learn/workspaces/prov/cohorts'] = [
      { id: 'c1', name: 'Fall', courseTitle: 'Data', enrolled: 12 },
    ]
    render(<ActivityPage workspace="prov" />)
    expect(screen.getByRole('link', { name: 'Fall' }).getAttribute('href')).toBe('/lms/activity/c1')
  })

  it('explains how time is counted in paragraphs and bullets, and downloads the CSV with the timezone', async () => {
    loads['/learn/cohorts/c1/activity'] = cohort
    loads['/learn/cohorts/c1'] = { id: 'c1', name: 'Fall' }
    render(<ActivityPage workspace="prov" cohortId="c1" />)
    expect(screen.getByText('How is time counted?').tagName).toBe('SUMMARY')
    const box = document.querySelector('details.ac-explainer')!
    expect(box.querySelectorAll(':scope > p').length).toBeGreaterThanOrEqual(3)
    expect(box.querySelectorAll(':scope > ul').length).toBe(2)
    expect(box.querySelectorAll('li').length).toBeGreaterThanOrEqual(5)
    const text = box.textContent!
    expect(text).toMatch(/not clicked, typed or scrolled for a minute/)
    expect(text).toMatch(/launching it until its score comes back/)
    expect(text).toMatch(/Times are shown in your timezone\./)
    expect(text).not.toMatch(/UTC|measured|estimated|grant/i)
    expect(document.querySelector('p.dash-sub')!.textContent).toMatch(
      /^\w{3}, \w{3} \d+ to \w{3}, \w{3} \d+$/
    )
    expect(screen.queryByText(/grant/i)).toBeNull()
    const btn = screen.getByRole('button', { name: 'Download CSV' })
    await userEvent.click(btn)
    expect(downloads).toHaveLength(1)
    expect(downloads[0]).toMatch(
      new RegExp(
        `^/learn/cohorts/c1/activity\\.csv\\?from=\\d{4}-\\d{2}-\\d{2}&to=\\d{4}-\\d{2}-\\d{2}&tz=${encodeURIComponent(TZ)}$`
      )
    )
    expect((await screen.findAllByRole('status'))[0].textContent).toMatch(
      /^Downloaded activity-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/
    )
  })

  it('drills into one learner and back', async () => {
    loads['/learn/cohorts/c1/activity'] = cohort
    loads['/learn/cohorts/c1/activity/learners/u1'] = {
      cohortId: 'c1',
      userId: 'u1',
      name: 'Ann Lee',
      from: 'a',
      to: 'b',
      tz: 'UTC',
      totalSeconds: 0,
      activeDays: 0,
      averagePerActiveDaySeconds: 0,
      days: [],
    }
    render(<ActivityPage workspace="prov" cohortId="c1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Daily log for Ann Lee' }))
    expect(screen.getByRole('heading', { name: 'Ann Lee' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Ann Lee' }))
    await userEvent.click(screen.getByRole('button', { name: /back to the cohort/i }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
    expect(screen.getByRole('table', { name: /time spent per learner/i })).toBeTruthy()
  })

  it('blocks a bad custom range and the download', async () => {
    loads['/learn/cohorts/c1/activity'] = cohort
    render(<ActivityPage workspace="prov" cohortId="c1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(
      (screen.getByRole('button', { name: /download csv/i }) as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('"Last 7 days" counts back from the moment it is clicked, not from when the page opened', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-10-07T12:00:00Z'))
      loads['/learn/cohorts/c1/activity'] = cohort
      render(<ActivityPage workspace="prov" cohortId="c1" />)
      vi.setSystemTime(new Date('2026-10-09T12:00:00Z')) // the tab sat open for two days
      await userEvent.click(screen.getByRole('button', { name: 'Last 7 days' }))
      await userEvent.click(screen.getByRole('button', { name: /download csv/i }))
      expect(downloads[0]).toMatch(/from=2026-10-0[2-3]&to=2026-10-(09|10)&tz=/)
    } finally {
      vi.useRealTimers()
    }
  })
})
