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
  totalSeconds: 4500,
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
      estimatedSeconds: 1200,
      activeDays: 2,
      firstSeenAt: '2026-10-05T10:00:00.000Z',
      lastSeenAt: '2026-10-07T14:05:00.000Z',
    },
    {
      userId: 'u2',
      name: 'Bo Quiet',
      totalSeconds: 900,
      estimatedSeconds: 0,
      activeDays: 1,
      firstSeenAt: null,
      lastSeenAt: null,
    },
  ],
  items: [{ itemId: 'i1', title: 'Intro', seconds: 4500, learners: 2 }],
}

describe('CohortView', () => {
  it('shows measured and estimated apart, with table semantics', async () => {
    const pick = vi.fn()
    render(<CohortView report={cohort} onPick={pick} />)
    const table = screen.getByRole('table', { name: /time spent per learner/i })
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
    expect(headers).toEqual([
      'Learner',
      'Total',
      'Measured',
      'Estimated',
      'Days active',
      'Last seen',
    ])
    const ann = within(table).getByRole('row', { name: /Ann Lee/ })
    const cells = within(ann)
      .getAllByRole('cell')
      .map((c) => c.textContent)
    expect(cells).toEqual(['1 h 00 min', '40 min', '20 min', '2', 'Oct 7, 14:05 UTC'])
    const bo = within(table).getByRole('row', { name: /Bo Quiet/ })
    expect(
      within(bo)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['15 min', '15 min', '—', '1', '—'])
    await userEvent.click(within(table).getByRole('button', { name: 'Ann Lee' }))
    expect(pick).toHaveBeenCalledWith('u1', 'Ann Lee')
  })

  it('says so when there is no activity', () => {
    render(<CohortView report={{ ...cohort, totalSeconds: 0, learners: [] }} onPick={vi.fn()} />)
    expect(screen.getByText(/no activity was recorded/i)).toBeTruthy()
  })
})

describe('DailyBars', () => {
  it('has a text alternative and a table of the same figures', () => {
    render(<DailyBars days={cohort.days} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Most: 45 min/)
    expect(screen.getByText(/show the daily figures as a table/i)).toBeTruthy()
    expect(screen.getAllByRole('row')).toHaveLength(4)
  })
})

describe('LearnerLog', () => {
  const report: LearnerActivityReport = {
    cohortId: 'c1',
    userId: 'u1',
    name: 'Ann Lee',
    from: '2026-10-05',
    to: '2026-10-07',
    totalSeconds: 3600,
    activeDays: 1,
    days: [
      {
        day: '2026-10-05',
        seconds: 3600,
        firstSeenAt: '2026-10-05T10:00:00.000Z',
        lastSeenAt: '2026-10-05T11:30:00.000Z',
        items: [
          { itemId: 'i1', title: 'Intro', seconds: 2400, estimated: false },
          { itemId: 'i2', title: 'Lab tool', seconds: 1200, estimated: true },
        ],
      },
    ],
  }
  it('lists minutes per item and marks estimates in words', () => {
    render(<LearnerLog report={report} />)
    expect(screen.getByText('Intro: 40 min')).toBeTruthy()
    const est = screen.getByText(/Lab tool: 20 min/)
    expect(est.textContent).toContain('(estimated)')
    expect(screen.getByText('Oct 5, 10:00 UTC')).toBeTruthy()
  })
  it('handles a learner with no activity', () => {
    render(<LearnerLog report={{ ...report, days: [], totalSeconds: 0, activeDays: 0 }} />)
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

  it('shows the cohort report, explains measured vs estimated, and downloads the CSV', async () => {
    loads['/learn/cohorts/c1/activity'] = cohort
    loads['/learn/cohorts/c1'] = { id: 'c1', name: 'Fall' }
    render(<ActivityPage workspace="prov" cohortId="c1" />)
    expect(screen.getByText(/counted by the server/i)).toBeTruthy()
    const btn = screen.getByRole('button', { name: /download csv for grant reporting/i })
    await userEvent.click(btn)
    expect(downloads).toHaveLength(1)
    expect(downloads[0]).toMatch(
      /^\/learn\/cohorts\/c1\/activity\.csv\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/
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
      totalSeconds: 0,
      activeDays: 0,
      days: [],
    }
    render(<ActivityPage workspace="prov" cohortId="c1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Ann Lee' }))
    expect(screen.getByRole('heading', { name: 'Ann Lee' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /back to the cohort/i }))
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
})
