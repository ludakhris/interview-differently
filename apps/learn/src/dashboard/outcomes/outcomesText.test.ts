import { describe, expect, it } from 'vitest'
import type { LearnerOutcomeCohort, LearnerOutcomes } from '@id/types'
import {
  averageScore,
  completionText,
  readinessSummary,
  readinessText,
  recentResults,
  scoreText,
  skillState,
} from './outcomesText'

const cohort = (over: Partial<LearnerOutcomeCohort> = {}): LearnerOutcomeCohort => ({
  cohortId: 'k1',
  cohortName: 'Fall',
  courseTitle: 'Data',
  host: 'Harbor',
  status: 'running',
  enrollmentStatus: 'enrolled',
  startsAt: null,
  endsAt: null,
  completedAt: null,
  itemsDone: 1,
  itemsTotal: 2,
  percent: 50,
  readiness: {
    pre: null,
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
  skills: [],
  items: [],
  ...over,
})
const data = (cohorts: LearnerOutcomeCohort[]): LearnerOutcomes => ({
  generatedAt: '2026-10-07T00:00:00Z',
  totals: {
    cohorts: cohorts.length,
    completedCohorts: 0,
    itemsDone: 0,
    itemsTotal: 0,
    attempts: 0,
  },
  cohorts,
})
const item = (id: string, score: number | null, completedAt: string | null) => ({
  itemId: id,
  title: id,
  type: 'quiz',
  status: completedAt ? ('completed' as const) : ('not_started' as const),
  score,
  attempts: 1,
  completedAt,
  review: false,
  preCheck: false,
})

describe('outcomes text', () => {
  it('says No score yet, never 0%, without a score', () => {
    expect(scoreText(null)).toBe('No score yet')
    expect(scoreText(0)).toBe('0%')
    expect(scoreText(81.6)).toBe('82%')
  })

  it('averages the scored items only, across courses', () => {
    const d = data([
      cohort({ items: [item('a', 80, 'x'), item('b', null, 'y')] }),
      cohort({ items: [item('c', 60, 'z')] }),
    ])
    expect(averageScore(d)).toBe(70)
    expect(averageScore(data([cohort()]))).toBeNull()
  })

  it('leaves out review duplicates and the pre-check, so each item counts once', () => {
    const d = data([
      cohort({
        items: [
          item('quiz', 80, 'x'),
          { ...item('quiz2', 20, 'x'), title: 'Review: quiz', review: true },
          { ...item('pre', 10, 'x'), preCheck: true },
        ],
      }),
    ])
    expect(averageScore(d)).toBe(80)
  })

  it('summarises readiness without claiming it', () => {
    expect(readinessSummary(data([]))).toBe('No interviews')
    expect(readinessSummary(data([cohort({ hasInterview: false })]))).toBe('No interviews')
    const ready = cohort({
      readiness: { ...cohort().readiness, interviewBest: 80, interviewReady: true },
    })
    expect(readinessSummary(data([ready, cohort()]))).toBe('1 of 2')
    // A course with no interview is not counted against the learner.
    expect(readinessSummary(data([ready, cohort({ hasInterview: false })]))).toBe('1 of 1')
    expect(readinessText(cohort({ hasInterview: false }))).toBe(
      'This course has no practice interview'
    )
    expect(readinessText(cohort())).toBe('Not yet (goal 70%)')
  })

  it('holds completion until readiness is reached', () => {
    expect(completionText(cohort({ itemsDone: 0 }))).toBe('Not started')
    expect(completionText(cohort())).toBe('In progress: 1 item left')
    expect(completionText(cohort({ itemsDone: 2 }))).toMatch(/reach 70%/)
    expect(completionText(cohort({ enrollmentStatus: 'completed' }))).toBe('Completed')
  })

  it('names skill states in words', () => {
    expect(skillState({ pct: null, flagged: false })).toBe('not_yet')
    expect(skillState({ pct: 40, flagged: true })).toBe('needs_work')
    expect(skillState({ pct: 90, flagged: false })).toBe('on_track')
  })

  it('lists recent results newest first and caps them', () => {
    const d = data([
      cohort({ items: [item('old', 50, '2026-09-01T00:00:00Z'), item('none', null, null)] }),
      cohort({ cohortId: 'k2', items: [item('new', 90, '2026-10-01T00:00:00Z')] }),
    ])
    expect(recentResults(d).map((r) => r.itemId)).toEqual(['new', 'old'])
    expect(recentResults(d, 1)).toHaveLength(1)
  })

  it('never asks for a practice interview in a course without one', () => {
    const noInterview = cohort({ itemsDone: 2, hasInterview: false })
    expect(completionText(noInterview)).toBe('All items done. Ready to be marked complete.')
    expect(completionText(noInterview)).not.toMatch(/interview/)
    expect(completionText(cohort({ hasInterview: false, itemsTotal: 4, itemsDone: 1 }))).toBe(
      'In progress: 3 items left'
    )
    const ready = cohort({
      itemsDone: 2,
      readiness: { ...cohort().readiness, interviewBest: 80, interviewReady: true },
    })
    expect(completionText(ready)).toBe('All items done. Ready to be marked complete.')
  })
})
