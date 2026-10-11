import type { LearnWorkspace } from '@id/types'
import { describe, expect, it } from 'vitest'
import {
  canExportExitFile,
  canManageMembers,
  canManageWorkspace,
  canSeeActivity,
  canSeeCohorts,
  canSeeOutcomes,
  canSeeTalent,
  highestRole,
  homePath,
  overallRole,
  roleIn,
} from './roleAccess'

const ws = (subdomain: string, role: string): LearnWorkspace => ({
  id: subdomain,
  name: subdomain,
  kind: 'provider',
  subdomain,
  parentId: null,
  featuredDemo: false,
  role,
})

describe('role access for the staff pages', () => {
  it('shows Talent and Support to provider and organization admins and platform administrators', () => {
    for (const r of ['provider-admin', 'organization-admin', 'system-admin'])
      expect(canSeeTalent(r)).toBe(true)
    for (const r of ['agency-admin', 'case-manager', 'instructor', undefined])
      expect(canSeeTalent(r)).toBe(false)
  })

  it('shows Activity, cohorts and rosters to admins and instructors, not case managers', () => {
    for (const r of [
      'agency-admin',
      'provider-admin',
      'organization-admin',
      'instructor',
      'system-admin',
    ]) {
      expect(canSeeActivity(r)).toBe(true)
      expect(canSeeCohorts(r)).toBe(true)
    }
    expect(canSeeActivity('case-manager')).toBe(false)
    expect(canSeeActivity(undefined)).toBe(false)
  })

  it('lets case managers read outcomes but not run anything', () => {
    expect(canSeeOutcomes('case-manager')).toBe(true)
    expect(canSeeOutcomes('instructor')).toBe(false)
    expect(canManageWorkspace('case-manager')).toBe(false)
    expect(canManageWorkspace('instructor')).toBe(false)
    expect(canExportExitFile('organization-admin')).toBe(true)
    expect(canExportExitFile('case-manager')).toBe(false)
  })

  it('lets only admins manage members', () => {
    expect(canManageMembers('organization-admin')).toBe(true)
    expect(canManageMembers('agency-admin')).toBe(true)
    expect(canManageMembers('instructor')).toBe(false)
    expect(canManageMembers('case-manager')).toBe(false)
  })

  it('sends each role to a page it may open', () => {
    expect(homePath('provider-admin', true)).toBe('/lms/courses')
    expect(homePath('organization-admin', false)).toBe('/lms/cohorts')
    expect(homePath('instructor', true)).toBe('/lms/cohorts')
    expect(homePath('case-manager', true)).toBe('/lms/dashboard')
  })
})

describe('the role a person holds', () => {
  it('is the highest role across their workspaces', () => {
    expect(highestRole(['instructor', 'provider-admin', 'case-manager'])).toBe('provider-admin')
    expect(highestRole(['organization-admin', 'agency-admin'])).toBe('agency-admin')
    expect(highestRole(['case-manager', 'organization-admin'])).toBe('organization-admin')
    expect(highestRole([])).toBeUndefined()
    expect(highestRole(['mystery'])).toBeUndefined()
  })

  it('comes from the account only for a platform administrator', () => {
    const list = [ws('a', 'instructor'), ws('b', 'case-manager')]
    expect(overallRole('system-admin', [])).toBe('system-admin')
    expect(overallRole('system-admin', null)).toBe('system-admin')
    expect(overallRole(undefined, list)).toBe('case-manager')
    // An older account-level role no longer counts.
    expect(overallRole('agency-admin', list)).toBe('case-manager')
    expect(overallRole(undefined, null)).toBeUndefined()
  })

  it('is looked up by workspace for pages about one workspace', () => {
    const list = [ws('a', 'instructor'), ws('b', 'provider-admin')]
    expect(roleIn(list, 'a')).toBe('instructor')
    expect(roleIn(list, 'b')).toBe('provider-admin')
    expect(roleIn(list, 'zzz')).toBeUndefined()
    expect(roleIn(null, 'a')).toBeUndefined()
  })
})
