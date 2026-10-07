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
})

describe('outcomes text', () => {
  it('says Not yet, never 0%, without a score', () => {
    expect(scoreText(null)).toBe('Not yet')
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

  it('summarises readiness without claiming it', () => {
    expect(readinessSummary(data([]))).toBe('Not yet')
    const ready = cohort({
      readiness: { ...cohort().readiness, interviewBest: 80, interviewReady: true },
    })
    expect(readinessSummary(data([ready, cohort()]))).toBe('1 of 2')
    expect(readinessText(cohort())).toBe('Not yet (goal 70%)')
  })

  it('holds completion until readiness is reached', () => {
    expect(completionText(cohort({ itemsDone: 0 }))).toBe('Not started')
    expect(completionText(cohort())).toBe('In progress')
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
})
