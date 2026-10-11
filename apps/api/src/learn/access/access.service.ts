import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { memoPerRequest, noteAuthorized } from '../../core/tenant-context'
import { PrismaService } from '../../prisma/prisma.service'
import {
  allows,
  highestRole,
  isRole,
  ROLES,
  SYSTEM_ADMIN,
  type Action,
  type Role,
} from './permissions'

/** Who is asking: the person, and the role on their account (only the platform administrator, see below). */
export interface Actor {
  userId: string
  /** The account role (Clerk `publicMetadata.role`). */
  role?: string
}

/** Where an action applies. A workspace is named by its address, a cohort by its id. */
export type Scope = { workspace: string } | { institutionId: string } | { cohortId: string }

interface Where {
  institutionId: string
  parentId: string | null
  kind: string
  cohortId: string | null
}

/** Institution kinds whose participant records a provider or organization admin may read. */
const RECORD_KINDS = ['provider', 'organization']

/** What an instructor may do at a workspace as a whole; callers narrow lists to their cohorts. */
const INSTRUCTOR_AT_WORKSPACE: Action[] = ['workspace.open', 'cohort.read', 'gradebook.read']

interface MembershipRow {
  institutionId: string
  cohortId: string | null
  role: string | null
  institution: { kind: string; parentId: string | null; subdomain: string | null }
}

/** What the caller's roles are in a workspace, for the chooser and the pages. */
export interface WorkspaceRole {
  institutionId: string
  role: Role | typeof SYSTEM_ADMIN
}

/**
 * Decides what a person may do (GitHub issue #84). `authorize` is the one place a role is checked: a
 * person's roles at a place come from their memberships there (an agency admin's also cover everything
 * under that agency), and `PERMISSIONS` says which roles may do which action.
 *
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** The platform administrator, who may do everything. */
  isSystemAdmin(actor: Pick<Actor, 'role'>): boolean {
    return actor.role === SYSTEM_ADMIN
  }

  /**
   * Throws unless the actor may do `action` at `scope`. The order matters and matches the old checks: first
   * whether any role they hold could do this at all (so a role that never could is refused before anything is
   * looked up), then where.
   */
  async authorize(actor: Actor, action: Action, scope: Scope): Promise<void> {
    if (!this.isSystemAdmin(actor)) {
      if (action === 'platform.admin') throw new ForbiddenException('Insufficient role')
      const rows = await this.membershipsOf(actor.userId)
      if (!allows(this.rolesOf(rows), action)) throw new ForbiddenException('Insufficient role')
      const where = await this.resolve(scope)
      const roles = this.rolesIn(where, rows)
      if (roles.length === 0)
        throw new ForbiddenException(
          action === 'participant.records'
            ? 'No access to this provider'
            : 'No access to this workspace'
        )
      if (!allows(roles, action)) throw new ForbiddenException('Insufficient role')
      // Participant records belong to providers and organizations, not to an agency or a college.
      if (action === 'participant.records' && !RECORD_KINDS.includes(where.kind))
        throw new ForbiddenException('No access to this provider')
      // An instructor counts at a workspace only to open it and list their cohorts (callers narrow the list with
      // `instructorCohortsIn`); anything else about a cohort must name the cohort.
      if (
        !where.cohortId &&
        roles.every((r) => r === ROLES.instructor) &&
        !INSTRUCTOR_AT_WORKSPACE.includes(action)
      )
        throw new ForbiddenException('Insufficient role')
    }
    noteAuthorized(action)
  }

  /** Throws unless the actor is the platform administrator (action `platform.admin`). */
  requireSystemAdmin(actor: Actor): void {
    if (!this.isSystemAdmin(actor)) throw new ForbiddenException('Insufficient role')
    noteAuthorized('platform.admin')
  }

  /** Whether the actor may do `action` at `scope`. */
  async can(actor: Actor, action: Action, scope: Scope): Promise<boolean> {
    try {
      await this.authorize(actor, action, scope)
      return true
    } catch (err) {
      if (err instanceof ForbiddenException) return false
      throw err
    }
  }

  /** Throws unless the actor holds a role that may do `action` somewhere (for pages that are not about one workspace). */
  async authorizeAnywhere(actor: Actor, action: Action): Promise<void> {
    if (!this.isSystemAdmin(actor)) {
      if (action === 'platform.admin') throw new ForbiddenException('Insufficient role')
      const rows = await this.membershipsOf(actor.userId)
      if (!allows(this.rolesOf(rows), action)) throw new ForbiddenException('Insufficient role')
    }
    noteAuthorized(action)
  }

  /**
   * The roles the actor holds at a place: in the institution itself, as agency admin of its agency, or as
   * instructor of the cohort. Name a cohort whenever the data is a cohort's: an instructor counts at a
   * workspace only so they can open it.
   */
  async rolesAt(actor: Actor, scope: Scope): Promise<Role[]> {
    const where = await this.resolve(scope)
    return this.rolesIn(where, await this.membershipsOf(actor.userId))
  }

  private rolesIn(where: Where, rows: MembershipRow[]): Role[] {
    const roles = new Set<Role>()
    for (const m of rows) {
      const role = this.roleOf(m)
      if (!role) continue
      if (m.cohortId) {
        // An instructor holds a cohort: that cohort, and (to open its workspace) the workspace it is in.
        const here = where.cohortId
          ? m.cohortId === where.cohortId
          : m.institutionId === where.institutionId
        if (role === ROLES.instructor && here) roles.add(role)
      } else if (m.institutionId === where.institutionId) {
        roles.add(role)
      } else if (role === ROLES.agencyAdmin && m.institutionId === where.parentId) {
        roles.add(role)
      }
    }
    return [...roles]
  }

  /** Every role the actor holds anywhere. */
  private rolesOf(rows: MembershipRow[]): Role[] {
    return rows.map((m) => this.roleOf(m)).filter((r): r is Role => !!r)
  }

  /**
   * The workspaces the actor may open, each with their highest role in it. The platform administrator
   * opens every agency and what reports to one; an agency admin also opens what reports to their agency.
   */
  async workspaceRoles(actor: Actor): Promise<WorkspaceRole[]> {
    const rows = await this.membershipsOf(actor.userId)
    const found = new Map<string, Role[]>()
    const agencies: string[] = []
    for (const m of rows) {
      const role = this.roleOf(m)
      if (!role || (m.cohortId && role !== ROLES.instructor)) continue
      found.set(m.institutionId, [...(found.get(m.institutionId) ?? []), role])
      if (role === ROLES.agencyAdmin && m.institution.kind === 'agency' && !m.cohortId)
        agencies.push(m.institutionId)
    }
    if (agencies.length > 0) {
      const under = await this.prisma.institution.findMany({
        where: { parentId: { in: agencies }, subdomain: { not: null } },
        select: { id: true },
      })
      for (const c of under) found.set(c.id, [...(found.get(c.id) ?? []), ROLES.agencyAdmin])
    }
    return [...found.entries()].flatMap(([institutionId, roles]) => {
      const role = highestRole(roles)
      return role ? [{ institutionId, role }] : []
    })
  }

  /** The providers and organizations where the actor may read participant records, worked out from their memberships in one pass. */
  async recordInstitutions(actor: Actor): Promise<string[]> {
    const rows = await this.membershipsOf(actor.userId)
    const ids = rows
      .filter((m) => !m.cohortId && RECORD_KINDS.includes(m.institution.kind))
      .filter((m) => allows([this.roleOf(m) ?? ''], 'participant.records'))
      .map((m) => m.institutionId)
    return [...new Set(ids)]
  }

  /** The cohort ids an instructor teaches in an institution; null for anyone who sees all of its cohorts. */
  async instructorCohortsIn(actor: Actor, institutionId: string): Promise<string[] | null> {
    if (this.isSystemAdmin(actor)) return null
    const roles = await this.rolesAt(actor, { institutionId })
    // Anyone whose own role reads the workspace's cohorts sees them all; an instructor is narrowed to theirs.
    if (roles.some((r) => r !== ROLES.instructor && allows([r], 'cohort.read'))) return null
    const rows = await this.membershipsOf(actor.userId)
    return rows
      .filter((m) => m.cohortId && m.institutionId === institutionId && m.role === ROLES.instructor)
      .map((m) => m.cohortId as string)
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async resolve(scope: Scope): Promise<Where> {
    if ('cohortId' in scope) {
      const cohort = await this.prisma.cohort.findUnique({
        where: { id: scope.cohortId },
        select: {
          institutionId: true,
          institution: { select: { parentId: true, kind: true } },
        },
      })
      if (!cohort) throw new NotFoundException('Cohort not found')
      return {
        institutionId: cohort.institutionId,
        parentId: cohort.institution.parentId,
        kind: cohort.institution.kind,
        cohortId: scope.cohortId,
      }
    }
    const inst = await this.prisma.institution.findFirst({
      where: 'workspace' in scope ? { subdomain: scope.workspace } : { id: scope.institutionId },
      select: { id: true, parentId: true, kind: true },
    })
    // An unknown address answers like one the caller may not open, so it does not say what exists.
    if (!inst) throw new ForbiddenException('No access to this workspace')
    return { institutionId: inst.id, parentId: inst.parentId, kind: inst.kind, cohortId: null }
  }

  private membershipsOf(userId: string): Promise<MembershipRow[]> {
    return memoPerRequest(`memberships:${userId}`, () =>
      this.prisma.membership.findMany({
        where: { userId },
        select: {
          institutionId: true,
          cohortId: true,
          role: true,
          institution: { select: { kind: true, parentId: true, subdomain: true } },
        },
      })
    )
  }

  /** The role a membership gives, or undefined when it gives none (a learner's own membership). */
  private roleOf(m: MembershipRow): Role | undefined {
    // An instructor is tied to a cohort. If the cohort is gone (the database clears the link), so is the role.
    if (m.role === ROLES.instructor) return m.cohortId ? ROLES.instructor : undefined
    return isRole(m.role) ? m.role : undefined
  }
}
