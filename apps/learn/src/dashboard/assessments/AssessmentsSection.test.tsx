// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AssessmentResults, AssessmentSummary } from '@id/types'

const loads: Record<string, unknown> = {}
const downloads: string[] = []
const sends: { path: string; body: unknown }[] = []
vi.mock('../api', () => ({
  useApiFetch: () => vi.fn(),
  useApiSend: () => async (_m: string, path: string, body: unknown) => {
    sends.push({ path, body })
    return { action: 'http://tool.test/login', fields: {} }
  },
  downloadFile: async (_f: unknown, path: string, name: string) => {
    downloads.push(`${path} -> ${name}`)
  },
  useLoad: (path: string | null) => ({
    data: path ? (loads[path] ?? null) : null,
    error: null,
    loading: false,
    reload: vi.fn(),
  }),
}))
vi.mock('../app-context', () => ({
  useApp: () => ({ href: (p: string) => `${p}?site=demo`, query: '?site=demo' }),
}))
vi.mock('../launchForm', () => ({ submitLaunchForm: vi.fn() }))

import { AssessmentsSection } from './AssessmentsSection'

afterEach(() => {
  cleanup()
  downloads.length = 0
  sends.length = 0
  for (const k of Object.keys(loads)) delete loads[k]
})

const summary: AssessmentSummary = {
  generatedAt: '2026-10-09T16:00:00Z',
  items: [
    {
      itemId: 'pre1',
      title: 'Pre-assessment',
      label: 'pre',
      attemptsAllowed: 1,
      counts: { notStarted: 2, inProgress: 0, submitted: 20 },
      averageScore: 48,
      improvement: null,
    },
    {
      itemId: 'post1',
      title: 'Post-assessment',
      label: 'post',
      attemptsAllowed: 1,
      counts: { notStarted: 10, inProgress: 2, submitted: 10 },
      averageScore: 78,
      improvement: { learners: 9, averagePre: 50, averagePost: 75, change: 25 },
    },
  ],
}

const results: AssessmentResults = {
  itemId: 'post1',
  title: 'Post-assessment',
  label: 'post',
  sections: [{ id: 's1', title: 'Basics' }],
  expectedMinutes: 10,
  medianMinutes: 12,
  improvement: { learners: 1, averagePre: 50, averagePost: 75, change: 25 },
  learners: [
    {
      enrollmentId: 'e1',
      userId: 'u1',
      name: 'Ana',
      email: 'a@x.test',
      status: 'submitted',
      submittedAt: '2026-10-09T12:20:00Z',
      late: true,
      minutes: 12,
      overall: 75,
      sections: [{ sectionId: 's1', correct: 3, total: 4 }],
      pre: 50,
      post: 75,
      change: 25,
    },
    {
      enrollmentId: 'e2',
      userId: 'u2',
      name: 'Ben',
      email: null,
      status: 'not_started',
      submittedAt: null,
      late: false,
      minutes: null,
      overall: null,
      sections: [],
      pre: 25,
      post: null,
      change: null,
    },
  ],
}

describe('AssessmentsSection', () => {
  it('lists each assessment with its stats and the improvement on the post', () => {
    loads['/learn/cohorts/k1/assessments'] = summary
    render(<AssessmentsSection cohortId="k1" />)
    const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) })
    expect(within(row('Pre-assessment')).getByText('20')).toBeTruthy() // submitted
    expect(within(row('Pre-assessment')).getByText('48%')).toBeTruthy()
    expect(within(row('Post-assessment')).getByText('+25 pts')).toBeTruthy()
    expect(within(row('Post-assessment')).getByText('50% → 75% over 9 learners')).toBeTruthy()
  })

  it('gives every row Live monitor, View results and Download CSV, and a download of all', async () => {
    loads['/learn/cohorts/k1/assessments'] = summary
    render(<AssessmentsSection cohortId="k1" />)
    const monitor = screen.getByRole('link', { name: 'Live monitor for Post-assessment' })
    expect(monitor.getAttribute('href')).toBe('/lms/cohorts/k1/monitor?site=demo&item=post1')
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV for Post-assessment' }))
    await userEvent.click(screen.getByRole('button', { name: 'Download all (CSV)' }))
    expect(downloads).toEqual([
      '/learn/cohorts/k1/assessments/post1/results.csv -> assessment-post-assessment.csv',
      '/learn/cohorts/k1/assessments.csv -> assessments.csv',
    ])
  })

  it('opens every learner result in a dialog, with pre and change on a post, and a way into answers', async () => {
    loads['/learn/cohorts/k1/assessments'] = summary
    loads['/learn/cohorts/k1/assessments/post1/results'] = results
    render(<AssessmentsSection cohortId="k1" />)
    await userEvent.click(screen.getByRole('button', { name: 'View results for Post-assessment' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Expected 10 min · Median 12 min · Improvement/)).toBeTruthy()
    const ana = within(dialog).getByRole('row', { name: /Ana/ })
    expect(within(ana).getByText('late')).toBeTruthy()
    expect(within(ana).getByText('3/4')).toBeTruthy()
    expect(within(ana).getByText('+25 pts')).toBeTruthy()
    const ben = within(dialog).getByRole('row', { name: /Ben/ })
    expect(within(ben).getByText('Not started')).toBeTruthy()
    expect(within(ben).queryByRole('button', { name: 'Answers' })).toBeNull()
    await userEvent.click(within(ana).getByRole('button', { name: 'Answers' }))
    expect(sends).toEqual([
      { path: '/learn/enrollments/e1/review-launch', body: { itemId: 'post1' } },
    ])
  })

  it('renders nothing for a course with no assessments', () => {
    loads['/learn/cohorts/k1/assessments'] = { ...summary, items: [] }
    const { container } = render(<AssessmentsSection cohortId="k1" />)
    expect(container.textContent).toBe('')
  })
})
