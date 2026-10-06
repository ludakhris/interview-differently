import { describe, expect, it } from 'vitest'
import { dateOnly } from './format'

describe('dateOnly', () => {
  it('shows a calendar day stored as UTC midnight as that day, whatever the timezone', () => {
    expect(dateOnly('2026-10-05T00:00:00.000Z')).toBe('Oct 5, 2026')
    expect(dateOnly('2027-01-24T00:00:00.000Z')).toBe('Jan 24, 2027')
  })

  it('shows a dash when there is no date', () => {
    expect(dateOnly(null)).toBe('—')
  })
})
