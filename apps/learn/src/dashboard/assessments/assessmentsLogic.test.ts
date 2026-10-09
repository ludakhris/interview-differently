import { describe, expect, it } from 'vitest'
import {
  changeText,
  fileSlug,
  improvementDetail,
  minutesText,
  percentText,
  sectionText,
} from './assessmentsLogic'

describe('assessmentsLogic', () => {
  it('words a change in points, with a real minus sign', () => {
    expect(changeText(25)).toBe('+25 pts')
    expect(changeText(-10)).toBe('−10 pts')
    expect(changeText(0)).toBe('0 pts')
  })

  it('words the detail behind an improvement', () => {
    expect(improvementDetail({ learners: 12, averagePre: 50, averagePost: 75, change: 25 })).toBe(
      '50% → 75% over 12 learners'
    )
    expect(improvementDetail({ learners: 1, averagePre: 40, averagePost: 80, change: 40 })).toBe(
      '40% → 80% over 1 learner'
    )
  })

  it('shows a dash for a missing percent, time or section score', () => {
    expect(percentText(82)).toBe('82%')
    expect(percentText(null)).toBe('—')
    expect(minutesText(12)).toBe('12 min')
    expect(minutesText(null)).toBe('—')
    expect(sectionText({ correct: 3, total: 4 })).toBe('3/4')
    expect(sectionText(undefined)).toBe('—')
  })

  it('makes a file-name-safe slug', () => {
    expect(fileSlug('Post-assessment')).toBe('post-assessment')
    expect(fileSlug('  IT Support: Final! ')).toBe('it-support-final')
    expect(fileSlug('???')).toBe('assessment')
  })
})
