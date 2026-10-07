import { describe, expect, it } from 'vitest'
import {
  COLLAPSED_COUNT,
  attemptWhen,
  earlierNote,
  hasAttemptInfo,
  passedText,
  visibleAttempts,
  type AttemptLogEntry,
} from './attemptsText'

const entry = (i: number): AttemptLogEntry => ({
  score: i,
  at: '2026-10-07T12:00:00Z',
  best: false,
  passed: null,
})

describe('attemptsText', () => {
  it('words the pass mark plainly', () => {
    expect(passedText(true)).toBe('Passed')
    expect(passedText(false)).toBe('Below the pass mark')
    expect(passedText(null)).toBeNull()
  })

  it('writes the earlier-attempts note in singular and plural, and nothing for zero', () => {
    expect(earlierNote(0)).toBeNull()
    expect(earlierNote(1)).toBe(
      '1 earlier attempt was not recorded, only your best score was kept.'
    )
    expect(earlierNote(3)).toBe(
      '3 earlier attempts were not recorded, only your best score was kept.'
    )
    expect(earlierNote(3, 'staff')).toBe(
      '3 earlier attempts were not recorded, only the best score was kept.'
    )
  })

  it('formats a date, and survives a bad one', () => {
    expect(attemptWhen('2026-10-07T12:00:00Z')).toMatch(/Oct 7, 2026/)
    expect(attemptWhen('nope')).toBe('—')
  })

  it('hides when there is no log and no earlier attempts', () => {
    expect(hasAttemptInfo(undefined, undefined)).toBe(false)
    expect(hasAttemptInfo([], 0)).toBe(false)
    expect(hasAttemptInfo([], 2)).toBe(true)
    expect(hasAttemptInfo([entry(1)], 0)).toBe(true)
  })

  it('collapses past five', () => {
    const six = Array.from({ length: COLLAPSED_COUNT + 1 }, (_, i) => entry(i))
    expect(visibleAttempts(six, false)).toHaveLength(COLLAPSED_COUNT)
    expect(visibleAttempts(six, true)).toHaveLength(COLLAPSED_COUNT + 1)
    expect(visibleAttempts(six.slice(0, 5), false)).toHaveLength(5)
  })
})
