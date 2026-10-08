import type { LearnWorkspace } from '@id/types'
import { canSeeActivity, canSeeTalent } from './roleAccess'

export interface NavLink {
  label: string
  href: string
  /** Opens the sign-in provider's account screen instead of navigating. */
  action?: 'security'
}
/** A dropdown row: a link, a section heading, or a line break. */
export type NavItem = NavLink | { heading: string } | { divider: true }

export interface NavModel {
  /** Top bar: the "Learner tools" menu. Null when the person has no learning. */
  learner: NavLink[] | null
  /** Top bar: the "Staff tools" menu. Null when the person has no workspace. */
  staff: NavItem[] | null
  /** Avatar menu groups. Null when the group does not apply. */
  account: { learner: NavLink[] | null; staff: NavLink[] | null }
}

export interface NavInput {
  role: string | undefined
  /** null until loaded */
  workspaces: LearnWorkspace[] | null
  current: LearnWorkspace | null
  /** Whether the person is enrolled in anything; null until loaded. */
  hasLearning: boolean | null
  pathname: string
  /** Builds a link that keeps ?site= and ?brand=. */
  href: (path: string) => string
  /** The workspace list: the current page's query without ?site=. */
  workspacesHref: string
}

const SYSTEM_ADMIN = 'system-admin'

function staffItems(i: NavInput): NavItem[] {
  const { current, role, href } = i
  const items: NavItem[] = [{ label: 'My workspaces', href: i.workspacesHref }]
  if (!current) return items
  items.push({ heading: current.name })
  if (current.kind === 'agency') {
    items.push({ label: 'Outcomes dashboard', href: href('/lms/dashboard') })
    if (current.subdomain === 'delaware') {
      items.push({ label: 'Career Readiness Tool', href: href('/') })
    }
    return items
  }
  items.push(
    { label: 'Outcomes', href: href('/lms/dashboard') },
    { label: 'Cohorts', href: href('/lms/cohorts') },
    { label: 'Courses', href: href('/lms/courses') }
  )
  const talent =
    canSeeTalent(role) && (current.kind === 'provider' || current.kind === 'organization')
  const activity = canSeeActivity(role)
  if (talent || activity) items.push({ divider: true })
  if (talent) items.push({ label: 'Talent', href: href('/lms/talent') })
  if (activity) items.push({ label: 'Learner activity', href: href('/lms/activity') })
  if (talent) items.push({ label: 'Learner support', href: href('/lms/talent/support') })
  return items
}

/**
 * What the navigation shows, from what the person has: learner links when they are enrolled in
 * something (or have nothing else, so a new account can join a cohort), staff links when they have
 * a workspace, and the Admin toolbox for system admins.
 */
export function buildNav(i: NavInput): NavModel {
  const none: NavModel = { learner: null, staff: null, account: { learner: null, staff: null } }
  if (!i.workspaces || i.hasLearning === null) return none
  const isStaff = i.workspaces.length > 0
  const showLearner = i.hasLearning || !isStaff
  const learner: NavLink[] = [
    { label: 'My learning', href: i.href('/lms/learning') },
    { label: 'My outcomes', href: i.href('/lms/learning/outcomes') },
    { label: 'My profile', href: i.href('/lms/learning/profile') },
  ]
  const admin: NavLink[] =
    i.role === SYSTEM_ADMIN ? [{ label: 'Admin toolbox', href: i.href('/lms/admin') }] : []
  const staffAccount: NavLink[] = [
    ...(isStaff ? [{ label: 'My workspaces', href: i.workspacesHref }] : []),
    ...admin,
  ]
  return {
    learner: showLearner ? learner : null,
    staff: isStaff ? staffItems(i) : null,
    account: {
      learner: showLearner
        ? [...learner, { label: 'Login & security', href: '#', action: 'security' }]
        : null,
      staff: staffAccount.length > 0 ? staffAccount : null,
    },
  }
}
