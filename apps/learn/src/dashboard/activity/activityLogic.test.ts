import { describe, expect, it } from 'vitest'
import {
  chartBars,
  formatDuration,
  isActive,
  minutesOf,
  parseLearningPath,
  presetRange,
  rangeProblem,
  weekStart,
} from './activityLogic'

describe('formatDuration', () => {
  it('shows sub-minute time instead of rounding it away', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(-5)).toBe('0 min')
    expect(formatDuration(20)).toBe('< 1 min')
    expect(formatDuration(60)).toBe('1 min')
    expect(formatDuration(45 * 60)).toBe('45 min')
    expect(formatDuration(65 * 60)).toBe('1 h 05 min')
    expect(formatDuration(3600)).toBe('1 h 00 min')
    expect(formatDuration(26 * 3600)).toBe('26 h 00 min')
  })
  it('matches the CSV minutes', () => {
    expect(minutesOf(90)).toBe('1.5')
    expect(minutesOf(-3)).toBe('0.0')
  })
})

describe('ranges', () => {
  const now = new Date('2026-10-07T23:59:00Z')
  it('presets end today (UTC) and include today', () => {
    expect(presetRange('last7', now)).toEqual({ from: '2026-10-01', to: '2026-10-07' })
    expect(presetRange('last30', now)).toEqual({ from: '2026-09-08', to: '2026-10-07' })
  })
  it('flags a bad custom range', () => {
    expect(rangeProblem('2026-10-01', '2026-10-07')).toBeNull()
    expect(rangeProblem('', '2026-10-07')).not.toBeNull()
    expect(rangeProblem('2026-02-30', '2026-03-05')).not.toBeNull()
    expect(rangeProblem('2026-10-08', '2026-10-07')).not.toBeNull()
    expect(rangeProblem('2025-10-06', '2026-10-07')).not.toBeNull()
    expect(rangeProblem('2025-10-07', '2026-10-07')).toBeNull()
  })
})

describe('week buckets', () => {
  it('weeks start on Monday', () => {
    expect(weekStart('2026-10-07')).toBe('2026-10-05') // Wednesday
    expect(weekStart('2026-10-05')).toBe('2026-10-05')
    expect(weekStart('2026-10-11')).toBe('2026-10-05') // Sunday
  })
  it('keeps days when short, buckets by week when long, and never loses time', () => {
    const days = Array.from({ length: 60 }, (_, i) => ({
      day: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10),
      seconds: 60,
      measuredSeconds: 40,
      estimatedSeconds: 20,
    }))
    expect(chartBars(days.slice(0, 30))).toHaveLength(30)
    const weeks = chartBars(days)
    // Measured and estimated stay apart when days are folded into weeks.
    expect(weeks.reduce((n, b) => n + b.measuredSeconds, 0)).toBe(2400)
    expect(weeks.reduce((n, b) => n + b.estimatedSeconds, 0)).toBe(1200)
    expect(weeks.length).toBeLessThan(12)
    expect(weeks.reduce((n, b) => n + b.seconds, 0)).toBe(3600)
    expect(weeks[0].start).toBe('2026-09-01')
    expect(weeks[0].end).toBe('2026-09-06') // clipped Mon-Sun week: Sep 1 is a Tuesday
  })
})

describe('idle', () => {
  it('is active only with input inside the window', () => {
    expect(isActive(null, 1000, 60_000)).toBe(false)
    expect(isActive(1000, 61_000, 60_000)).toBe(true)
    expect(isActive(1000, 61_001, 60_000)).toBe(false)
  })
})

describe('parseLearningPath', () => {
  it('reads cohort and item', () => {
    expect(parseLearningPath('/lms/learning/c1')).toEqual({ cohortId: 'c1', itemId: null })
    expect(parseLearningPath('/lms/learning/c1/')).toEqual({ cohortId: 'c1', itemId: null })
    expect(parseLearningPath('/lms/learning/c1/i%201')).toEqual({ cohortId: 'c1', itemId: 'i 1' })
  })
  it('is null for pages that are not a cohort', () => {
    expect(parseLearningPath('/lms/learning')).toBeNull()
    expect(parseLearningPath('/lms/learning/')).toBeNull()
    expect(parseLearningPath('/lms/learning/outcomes')).toBeNull()
    expect(parseLearningPath('/lms/learning/profile')).toBeNull()
    expect(parseLearningPath('/lms/cohorts/c1')).toBeNull()
    expect(parseLearningPath('/lms/learning/c1/i1/extra')).toBeNull()
    expect(parseLearningPath('/lms/learning/%E0%A4%A')).toBeNull()
  })
})
