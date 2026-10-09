// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  AssessmentMonitorDelivery,
  CohortAssessmentMonitor,
  CohortSqlMonitor,
  SqlMonitorStudent,
} from '@id/types'

const loads: Record<string, unknown> = {}
vi.mock('../api', () => ({
  useLoad: (path: string | null) => ({
    data: path ? (loads[path] ?? null) : null,
    error: null,
    loading: false,
    reload: vi.fn(),
  }),
}))
vi.mock('../app-context', () => ({ useApp: () => ({ href: (p: string) => p }) }))
vi.mock('../shared', () => ({ errorNotice: () => <p>error</p> }))

import { DeliveryCard, MonitorPage, SqlStudent } from './MonitorPage'

afterEach(() => {
  cleanup()
  for (const k of Object.keys(loads)) delete loads[k]
})

const delivery: AssessmentMonitorDelivery = {
  id: 'd1',
  label: 'Post-assessment',
  tags: ['post'],
  assessmentTitle: 'IT Support bank',
  itemId: 'post-item',
  opensAt: null,
  closesAt: null,
  timeLimitMinutes: 30,
  counts: { notStarted: 1, inProgress: 1, submitted: 1 },
  students: [
    {
      userId: 'u1',
      name: 'Ben',
      email: null,
      status: 'in_progress',
      answeredCount: 3,
      questionCount: 4,
      startedAt: '2026-10-09T16:00:00Z',
      submittedAt: null,
      lastActivityAt: '2026-10-09T16:05:00Z',
    },
    {
      userId: 'u2',
      name: 'Cy',
      email: null,
      status: 'not_started',
      answeredCount: 0,
      questionCount: 0,
      startedAt: null,
      submittedAt: null,
      lastActivityAt: null,
    },
    {
      userId: 'u3',
      name: 'Dee',
      email: null,
      status: 'submitted',
      answeredCount: 4,
      questionCount: 4,
      startedAt: '2026-10-09T15:00:00Z',
      submittedAt: '2026-10-09T15:20:00Z',
      lastActivityAt: '2026-10-09T15:20:00Z',
    },
  ],
}

describe('DeliveryCard', () => {
  it('shows counts, the time limit and each learner with progress', () => {
    render(<DeliveryCard delivery={delivery} />)
    expect(screen.getByRole('heading', { name: /Post-assessment/ })).toBeTruthy()
    expect(screen.getByText('post')).toBeTruthy() // the chip
    expect(screen.getByText(/Assessment: IT Support bank · 30 min limit/)).toBeTruthy()
    expect(screen.getByText('1 submitted')).toBeTruthy()
    const row = (name: string) => screen.getByText(name).closest('tr') as HTMLElement
    expect(within(row('Ben')).getByText('In progress')).toBeTruthy()
    expect(within(row('Ben')).getByText(/3 of 4 answered/)).toBeTruthy()
    expect(within(row('Cy')).getByText('Not started')).toBeTruthy()
    expect(within(row('Dee')).getByText('Submitted')).toBeTruthy()
  })

  it('says so when nobody has launched the assessment yet', () => {
    render(
      <DeliveryCard delivery={{ ...delivery, assessmentTitle: null, timeLimitMinutes: null }} />
    )
    expect(screen.getByText('Not started yet')).toBeTruthy()
  })

  it('lists active learners first, then submitted, then not started, and sorts by a clicked header', async () => {
    render(<DeliveryCard delivery={delivery} />)
    const names = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((r) => within(r).getAllByRole('cell')[0].textContent)
    expect(names()).toEqual(['Ben', 'Dee', 'Cy'])
    await userEvent.click(screen.getByRole('button', { name: /^Learner/ }))
    expect(names()).toEqual(['Ben', 'Cy', 'Dee'])
    await userEvent.click(screen.getByRole('button', { name: /^Learner/ }))
    expect(names()).toEqual(['Dee', 'Cy', 'Ben'])
  })
})

const sqlStudent: SqlMonitorStudent = {
  userId: 'u1',
  name: 'Ana',
  email: null,
  queryCount: 3,
  errorCount: 1,
  lastQueryAt: '2026-10-09T16:00:00Z',
  queries: [1, 2, 3].map((n) => ({
    id: `q${n}`,
    datasetSlug: 'shop',
    queryText: `SELECT ${n}`,
    ok: n !== 2,
    errorMessage: n === 2 ? 'syntax error' : null,
    rowCount: n === 2 ? null : 1,
    durationMs: 5,
    createdAt: '2026-10-09T16:00:00Z',
  })),
}

describe('SqlStudent', () => {
  it('shows the newest queries first, with an error flagged, and expands the older ones', async () => {
    render(<SqlStudent student={sqlStudent} />)
    expect(screen.getByText(/3 queries/)).toBeTruthy()
    expect(screen.getByText(/1 error/)).toBeTruthy()
    expect(screen.getByText('SELECT 1')).toBeTruthy()
    expect(screen.getByText('syntax error')).toBeTruthy()
    expect(screen.queryByText('SELECT 3')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Show 1 older query' }))
    expect(screen.getByText('SELECT 3')).toBeTruthy()
  })

  it('says when a learner has run nothing', () => {
    render(<SqlStudent student={{ ...sqlStudent, queryCount: 0, errorCount: 0, queries: [] }} />)
    expect(screen.getByText('No queries yet.')).toBeTruthy()
  })
})

describe('MonitorPage', () => {
  const assessments: CohortAssessmentMonitor = {
    generatedAt: '2026-10-09T16:10:00Z',
    cohort: { id: 'k1', name: 'Cohort' },
    deliveries: [delivery],
    other: [],
  }
  const sql = (enabled: boolean): CohortSqlMonitor => ({
    generatedAt: '2026-10-09T16:10:00Z',
    cohort: { id: 'k1', name: 'Cohort' },
    enabled,
    retentionDays: 30,
    students: [sqlStudent],
  })

  it('shows assessments, and SQL practice only when the cohort uses the sandbox', async () => {
    loads['/learn/cohorts/k1'] = { name: 'Cohort' }
    loads['/learn/cohorts/k1/monitor/assessments'] = assessments
    loads['/learn/cohorts/k1/monitor/sql'] = sql(false)
    const { unmount } = render(<MonitorPage cohortId="k1" />)
    const only = screen.getByRole('combobox', { name: 'Assessment:' })
    expect(within(only).queryByRole('option', { name: 'SQL practice' })).toBeNull()
    unmount()

    loads['/learn/cohorts/k1/monitor/sql'] = sql(true)
    render(<MonitorPage cohortId="k1" />)
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Assessment:' }),
      'SQL practice'
    )
    expect(screen.getByText(/Queries are kept for 30 days/)).toBeTruthy()
    expect(screen.getByText('Ana')).toBeTruthy()
  })

  it('says so when the course has no assessments', () => {
    loads['/learn/cohorts/k1/monitor/assessments'] = { ...assessments, deliveries: [] }
    loads['/learn/cohorts/k1/monitor/sql'] = sql(false)
    render(<MonitorPage cohortId="k1" />)
    expect(screen.getByText('This course has no assessments.')).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Assessment:' })).toBeNull()
  })

  const pre = {
    ...delivery,
    id: 'pre',
    itemId: 'pre-item',
    label: 'Pre-assessment',
    tags: ['pre'],
    counts: { notStarted: 3, inProgress: 0, submitted: 0 },
    students: [],
  }

  it('shows nothing until an assessment is chosen, then one at a time', async () => {
    loads['/learn/cohorts/k1/monitor/assessments'] = { ...assessments, deliveries: [pre, delivery] }
    loads['/learn/cohorts/k1/monitor/sql'] = sql(false)
    render(<MonitorPage cohortId="k1" />)
    const pick = screen.getByRole('combobox', { name: 'Assessment:' }) as HTMLSelectElement
    expect(pick.value).toBe('') // no default, even though someone is working on the Post
    expect(screen.getByText(/Choose an assessment to see/)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /assessment/i })).toBeNull()
    expect(
      within(pick)
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['Choose an assessment…', 'Pre-assessment', 'Post-assessment (1 in progress)'])
    await userEvent.selectOptions(pick, 'Post-assessment (1 in progress)')
    expect(screen.getByRole('heading', { name: /Post-assessment/ })).toBeTruthy()
    await userEvent.selectOptions(pick, 'Pre-assessment')
    expect(screen.getByRole('heading', { name: /Pre-assessment/ })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /Post-assessment/ })).toBeNull()
  })

  it('opens the assessment named by an ?item= link', () => {
    window.history.pushState({}, '', '/lms/cohorts/k1/monitor?item=pre-item')
    loads['/learn/cohorts/k1/monitor/assessments'] = { ...assessments, deliveries: [pre, delivery] }
    loads['/learn/cohorts/k1/monitor/sql'] = sql(false)
    render(<MonitorPage cohortId="k1" />)
    expect(screen.getByRole('heading', { name: /Pre-assessment/ })).toBeTruthy()
    window.history.pushState({}, '', '/')
  })

  it('lists a delivery scheduled outside the course as its own choice, with a note', async () => {
    loads['/learn/cohorts/k1/monitor/assessments'] = {
      ...assessments,
      other: [{ ...delivery, id: 'x', label: 'Side bank', tags: [] }],
    }
    loads['/learn/cohorts/k1/monitor/sql'] = sql(false)
    render(<MonitorPage cohortId="k1" />)
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Assessment:' }),
      'Side bank (outside the course) (1 in progress)'
    )
    expect(
      screen.getByText(/scheduled for the cohort directly in Interview Differently/)
    ).toBeTruthy()
  })
})
