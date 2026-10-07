// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LearnerOutcomes } from '@id/types'

let state: { data: unknown; error: Error | null; loading: boolean }
const reload = vi.fn()
vi.mock('../api', () => ({ useLoad: () => ({ ...state, reload }) }))
vi.mock('../app-context', () => ({ useApp: () => ({ href: (p: string) => p }) }))

import { LearnerOutcomesPage } from './LearnerOutcomesPage'

afterEach(() => {
  cleanup()
  reload.mockReset()
})

const outcomes: LearnerOutcomes = {
  generatedAt: '2026-10-07T00:00:00Z',
  totals: { cohorts: 1, completedCohorts: 0, itemsDone: 2, itemsTotal: 3, attempts: 3 },
  cohorts: [
    {
      cohortId: 'k1',
      cohortName: 'Fall',
      courseTitle: 'Data Analysis',
      host: 'Harbor',
      status: 'running',
      enrollmentStatus: 'enrolled',
      startsAt: '2026-09-01T00:00:00Z',
      endsAt: '2026-12-01T00:00:00Z',
      completedAt: null,
      itemsDone: 2,
      itemsTotal: 3,
      percent: 67,
      readiness: {
        pre: 40,
        post: null,
        gain: null,
        targetScore: 75,
        reachedTarget: false,
        interviewBest: null,
        readinessThreshold: 70,
        interviewReady: false,
        completed: false,
      },
      hasInterview: true,
      skills: [
        { id: 's1', label: 'SQL', pct: 40, targetPct: 70, flagged: true },
        { id: 's2', label: 'Charts', pct: null, targetPct: 70, flagged: false },
      ],
      items: [
        {
          itemId: 'i1',
          title: 'Pre-check',
          type: 'knowledge_check',
          status: 'completed',
          score: 40,
          attempts: 2,
          completedAt: '2026-10-01T10:00:00Z',
          review: false,
          preCheck: true,
        },
        {
          itemId: 'i2',
          title: 'Intro lesson',
          type: 'lesson',
          status: 'completed',
          score: null,
          attempts: 1,
          completedAt: '2026-10-02T10:00:00Z',
          review: false,
          preCheck: false,
        },
      ],
    },
  ],
}

describe('LearnerOutcomesPage', () => {
  it('shows the summary, a course card, skills in words and the timeline', () => {
    state = { data: outcomes, error: null, loading: false }
    render(<LearnerOutcomesPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'My outcomes' })).toBeTruthy()
    const summary = screen.getByRole('region', { name: 'Summary' })
    expect(within(summary).getByText('2 of 3')).toBeTruthy()
    expect(screen.getByText('Interview readiness: Not yet (goal 70%)')).toBeTruthy()
    expect(screen.getByText('Needs work')).toBeTruthy()
    // An unanswered skill is "Not yet", not 0%.
    expect(screen.getAllByText('Not yet').length).toBeGreaterThan(0)
    // The unreached "after" score reads as words, and decorative bars are hidden from readers.
    expect(screen.getByText(/After: No score yet/)).toBeTruthy()
    expect(document.querySelectorAll('.lo-bar[aria-hidden="true"]').length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.getByText('Nothing scored yet')).toBeTruthy()
    expect(screen.getByText('Attempts on scored items')).toBeTruthy()
    // Valid markup: no paragraph inside the definition list.
    expect(document.querySelector('dl p')).toBeNull()
    expect(
      screen.getByRole('link', { name: /Open course Data Analysis/ }).getAttribute('href')
    ).toBe('/lms/learning/k1')
    expect(screen.getByText('2 attempts · Done')).toBeTruthy()
    const timeline = screen.getByRole('heading', { name: 'Recent results' })
    expect(timeline).toBeTruthy()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(3)
  })

  it('shows an empty state with a way to join a course', () => {
    state = {
      data: { ...outcomes, totals: { ...outcomes.totals, cohorts: 0 }, cohorts: [] },
      error: null,
      loading: false,
    }
    render(<LearnerOutcomesPage />)
    expect(screen.getByRole('heading', { name: 'No outcomes yet' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to My learning' })).toBeTruthy()
  })

  it('shows a loading line while waiting', () => {
    state = { data: null, error: null, loading: true }
    render(<LearnerOutcomesPage />)
    expect(screen.getByText('Loading your outcomes…')).toBeTruthy()
  })

  it('shows the error and retries', async () => {
    state = { data: null, error: new Error('Request failed (500)'), loading: false }
    render(<LearnerOutcomesPage />)
    expect(screen.getByRole('alert').textContent).toContain('could not be loaded')
    expect(screen.getByRole('alert').textContent).not.toContain('Request failed')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
