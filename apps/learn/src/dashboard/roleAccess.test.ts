import { describe, expect, it } from 'vitest'
import { canSeeActivity, canSeeTalent } from './roleAccess'

describe('role access for the staff pages', () => {
  it('shows Talent and Support to provider and system admins only', () => {
    expect(canSeeTalent('provider-admin')).toBe(true)
    expect(canSeeTalent('system-admin')).toBe(true)
    expect(canSeeTalent('agency-admin')).toBe(false)
    expect(canSeeTalent('case-manager')).toBe(false)
    expect(canSeeTalent(undefined)).toBe(false)
  })

  it('shows Activity to the roster roles only', () => {
    for (const r of ['agency-admin', 'provider-admin', 'system-admin'])
      expect(canSeeActivity(r)).toBe(true)
    expect(canSeeActivity('case-manager')).toBe(false)
    expect(canSeeActivity(undefined)).toBe(false)
  })
})
