import type { LearnWorkspace } from '@id/types'
import { describe, expect, it } from 'vitest'
import { buildNav, type NavInput, type NavItem } from './navModel'

const ws = (over: Partial<LearnWorkspace>): LearnWorkspace => ({
  id: 'w',
  name: 'W',
  kind: 'provider',
  subdomain: 'w',
  parentId: null,
  featuredDemo: false,
  ...over,
})
const provider = ws({ id: 'p', name: 'Cedar Mill', kind: 'provider', subdomain: 'cedar' })
const org = ws({ id: 'o', name: 'Harbor', kind: 'organization', subdomain: 'harbor' })
const agency = ws({ id: 'a', name: 'Delaware', kind: 'agency', subdomain: 'delaware' })

const input = (over: Partial<NavInput>): NavInput => ({
  role: 'provider-admin',
  workspaces: [provider],
  current: provider,
  hasLearning: false,
  pathname: '/lms/dashboard',
  href: (p) => p,
  workspacesHref: '/lms/dashboard',
  ...over,
})
const labels = (items: NavItem[] | null) =>
  (items ?? []).map((i) => ('divider' in i ? '—' : 'heading' in i ? `# ${i.heading}` : i.label))

describe('buildNav', () => {
  it('shows nothing until the workspaces and learning are known', () => {
    expect(buildNav(input({ workspaces: null })).staff).toBeNull()
    expect(buildNav(input({ hasLearning: null })).learner).toBeNull()
  })

  it('gives a staff member who is not enrolled only staff tools', () => {
    const n = buildNav(input({}))
    expect(n.learner).toBeNull()
    expect(n.account.learner).toBeNull()
    expect(n.staff).not.toBeNull()
  })

  it('gives a learner with no workspace only learner tools', () => {
    const n = buildNav(input({ workspaces: [], current: null, hasLearning: true }))
    expect(n.staff).toBeNull()
    expect(n.account.staff).toBeNull()
    expect(n.learner?.map((l) => l.label)).toEqual(['My learning', 'My outcomes', 'My profile'])
  })

  it('gives a brand-new account (no workspace, nothing enrolled) learner tools so it can join a cohort', () => {
    const n = buildNav(
      input({ workspaces: [], current: null, hasLearning: false, role: undefined })
    )
    expect(n.learner).not.toBeNull()
    expect(n.staff).toBeNull()
  })

  it('gives someone who is both staff and a learner both menus', () => {
    const n = buildNav(input({ hasLearning: true }))
    expect(n.learner).not.toBeNull()
    expect(n.staff).not.toBeNull()
  })

  it('the account menu lists Login & security last in the learner group', () => {
    const l = buildNav(input({ hasLearning: true })).account.learner
    expect(l?.map((x) => x.label)).toEqual([
      'My learning',
      'My outcomes',
      'My profile',
      'Login & security',
    ])
    expect(l?.at(-1)?.action).toBe('security')
  })

  it('a provider-admin of a provider gets outcomes, cohorts, courses, then talent, activity and support', () => {
    expect(labels(buildNav(input({})).staff)).toEqual([
      'My workspaces',
      '# Cedar Mill',
      'Outcomes',
      'Cohorts',
      'Courses',
      '—',
      'Talent',
      'Learner activity',
      'Learner support',
    ])
  })

  it('an organization gets the same, including Talent and Support', () => {
    expect(labels(buildNav(input({ workspaces: [org], current: org })).staff)).toEqual([
      'My workspaces',
      '# Harbor',
      'Outcomes',
      'Cohorts',
      'Courses',
      '—',
      'Talent',
      'Learner activity',
      'Learner support',
    ])
  })

  it('an agency admin gets the dashboard and the Career Readiness Tool only on Delaware', () => {
    const n = buildNav(input({ role: 'agency-admin', workspaces: [agency], current: agency }))
    expect(labels(n.staff)).toEqual([
      'My workspaces',
      '# Delaware',
      'Outcomes dashboard',
      'Career Readiness Tool',
    ])
    const other = ws({ id: 'c', name: 'Chesapeake', kind: 'agency', subdomain: 'chesapeake' })
    expect(
      labels(buildNav(input({ role: 'agency-admin', workspaces: [other], current: other })).staff)
    ).toEqual(['My workspaces', '# Chesapeake', 'Outcomes dashboard'])
  })

  it('hides Talent and Support from roles that cannot open them, and Activity from those who cannot', () => {
    const l = labels(buildNav(input({ role: 'case-manager' })).staff)
    expect(l).not.toContain('Talent')
    expect(l).not.toContain('Learner support')
    expect(l).not.toContain('Learner activity')
    expect(l).not.toContain('—')
  })

  it('offers Admin toolbox only to system admins, and even when they have no workspace', () => {
    expect(buildNav(input({})).account.staff?.map((l) => l.label)).toEqual(['My workspaces'])
    const root = buildNav(input({ role: 'system-admin', workspaces: [], current: null }))
    expect(root.account.staff?.map((l) => l.label)).toEqual(['Admin toolbox'])
    expect(root.staff).toBeNull()
  })

  it('with no current workspace (the chooser) lists only My workspaces', () => {
    expect(labels(buildNav(input({ current: null })).staff)).toEqual(['My workspaces'])
  })
})
