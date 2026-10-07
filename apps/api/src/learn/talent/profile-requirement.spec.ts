import {
  addMonths,
  dueByOf,
  isFresh,
  profileLead,
  refreshMonthsOf,
  requirementState,
} from './profile-requirement'

const NOW = new Date('2026-10-07T12:00:00Z')
const facts = (updatedAt: string, complete = true) => ({
  complete,
  completedAt: new Date(updatedAt),
  updatedAt: new Date(updatedAt),
})

describe('addMonths', () => {
  it('adds calendar months in UTC and clamps to the end of a short month', () => {
    expect(addMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString()).toBe(
      '2026-02-28T10:00:00.000Z'
    )
    expect(addMonths(new Date('2028-01-31T10:00:00Z'), 1).toISOString()).toBe(
      '2028-02-29T10:00:00.000Z'
    )
    expect(addMonths(new Date('2026-11-15T00:00:00Z'), 3).toISOString()).toBe(
      '2027-02-15T00:00:00.000Z'
    )
    expect(addMonths(new Date('2026-10-07T00:00:00Z'), 60).toISOString()).toBe(
      '2031-10-07T00:00:00.000Z'
    )
  })
})

describe('freshness', () => {
  it('never goes stale without a period', () => {
    expect(isFresh(new Date('2000-01-01'), null, NOW)).toBe(true)
    expect(dueByOf(new Date('2000-01-01'), null)).toBeNull()
    expect(dueByOf(null, 6)).toBeNull()
  })
  it('goes stale exactly at the due moment', () => {
    const saved = new Date('2026-04-07T12:00:00Z')
    expect(dueByOf(saved, 6)?.toISOString()).toBe('2026-10-07T12:00:00.000Z')
    expect(isFresh(saved, 6, NOW)).toBe(false)
    expect(isFresh(saved, 6, new Date(NOW.getTime() - 1))).toBe(true)
  })
})

describe('requirementState', () => {
  it('names where the profile stands against the rule', () => {
    expect(requirementState(null, 6, NOW)).toBe('missing')
    expect(requirementState(facts('2026-10-01T00:00:00Z', false), 6, NOW)).toBe('incomplete')
    expect(requirementState(facts('2026-01-01T00:00:00Z'), 6, NOW)).toBe('needs_refresh')
    expect(requirementState(facts('2026-09-01T00:00:00Z'), 6, NOW)).toBe('done')
    expect(requirementState(facts('2020-01-01T00:00:00Z'), null, NOW)).toBe('done')
  })
})

describe('a cohort rule', () => {
  it('ignores a refresh period unless the profile is required', () => {
    expect(refreshMonthsOf({ requiresProfile: false, profileRefreshMonths: 6 })).toBeNull()
    expect(refreshMonthsOf({ requiresProfile: true, profileRefreshMonths: 6 })).toBe(6)
    expect(refreshMonthsOf({ requiresProfile: true, profileRefreshMonths: null })).toBeNull()
    expect(refreshMonthsOf(undefined)).toBeNull()
  })
  it('picks the lead item: the course own first profile item, else the synthetic one, else none', () => {
    expect(profileLead([], false)).toBeNull()
    expect(profileLead(['a', 'b'], false)).toBeNull()
    expect(profileLead(['a', 'b'], true)).toEqual({ leadId: 'a', synthetic: false })
    expect(profileLead([], true)).toEqual({ leadId: 'profile', synthetic: true })
  })
})
