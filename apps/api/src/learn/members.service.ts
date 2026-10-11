import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { runAsSystem } from '../core/tenant-context'
import { ClerkService } from '../auth/clerk.service'
import { PrismaService } from '../prisma/prisma.service'
import { AccessService, type Actor } from './access/access.service'
import { GRANTABLE, highestRole, isRole, ROLE_ORDER, ROLES, type Role } from './access/permissions'

/** A person's role at a workspace, as the members page lists it. */
export interface WorkspaceMember {
  membershipId: string
  userId: string
  name: string
  email: string | null
  role: Role
  /** For an instructor: the cohort they teach. */
  cohort: { id: string; name: string } | null
}

/** A role offered to an email address whose owner has not opened Learn Differently yet. */
export interface WorkspaceInvite {
  inviteId: string
  email: string
  role: Role
  cohort: { id: string; name: string } | null
  createdAt: string
}

export type GrantResult =
  | { status: 'added'; member: WorkspaceMember }
  | { status: 'invited'; invite: WorkspaceInvite }

/** The institution kinds each role may be held at. */
const KINDS: Record<Role, string[]> = {
  [ROLES.agencyAdmin]: ['agency'],
  [ROLES.providerAdmin]: ['provider'],
  [ROLES.organizationAdmin]: ['organization', 'academic'],
  [ROLES.caseManager]: ['agency', 'provider', 'organization', 'academic'],
  [ROLES.instructor]: ['provider', 'organization', 'academic'],
}

/**
 * Who works in a workspace, and in what role (GitHub issue #84). A role is a membership with `role` set:
 * the person, the institution and, for an instructor, the cohort. A person may give a role only up to the
 * ones their own role may give (GRANTABLE), and only at a place they hold access to.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly clerk: ClerkService
  ) {}

  private async workspace(subdomain: string) {
    const ws = await this.prisma.institution.findFirst({
      where: { subdomain },
      select: { id: true, name: true, kind: true },
    })
    if (!ws) throw new ForbiddenException('No access to this workspace')
    return ws
  }

  /** Everyone holding a role at this workspace (cohort-level instructors included), and the roles the caller may give. */
  async list(
    actor: Actor,
    subdomain: string
  ): Promise<{ members: WorkspaceMember[]; invites: WorkspaceInvite[]; grantable: Role[] }> {
    const grantable = await this.grantableAt(actor, subdomain)
    const ws = await this.workspace(subdomain)
    const rows = await this.prisma.membership.findMany({
      where: { institutionId: ws.id, role: { not: null } },
      select: {
        id: true,
        userId: true,
        role: true,
        user: { select: { displayName: true, email: true } },
        cohort: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    const members = rows
      .filter((r): r is typeof r & { role: Role } => isRole(r.role))
      .map((r) => ({
        membershipId: r.id,
        userId: r.userId,
        name: r.user.displayName ?? r.user.email ?? r.userId,
        email: r.user.email,
        role: r.role,
        cohort: r.cohort,
      }))
    const pending = await this.prisma.roleInvite.findMany({
      where: { institutionId: ws.id },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        cohort: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    const invites = pending
      .filter((i): i is typeof i & { role: Role } => isRole(i.role))
      .map((i) => ({
        inviteId: i.id,
        email: i.email,
        role: i.role,
        cohort: i.cohort,
        createdAt: i.createdAt.toISOString(),
      }))
    return { members, invites, grantable }
  }

  /**
   * The roles this person may give here: the platform administrator any, else what their own role may give,
   * and in both cases only roles that can be held at this kind of workspace.
   */
  async grantableAt(actor: Actor, subdomain: string): Promise<Role[]> {
    await this.access.authorize(actor, 'members.manage', { workspace: subdomain })
    const ws = await this.workspace(subdomain)
    const mine = this.access.isSystemAdmin(actor)
      ? ROLE_ORDER
      : (GRANTABLE[highestRole(await this.access.rolesAt(actor, { workspace: subdomain })) ?? ''] ??
        [])
    return mine.filter((r) => KINDS[r].includes(ws.kind))
  }

  /** Gives `email` a role at the workspace, or changes the one they have there. */
  async grant(
    actor: Actor,
    subdomain: string,
    body: { email?: unknown; role?: unknown; cohortId?: unknown }
  ): Promise<GrantResult> {
    const allowed = await this.grantableAt(actor, subdomain)
    const ws = await this.workspace(subdomain)
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email) throw new BadRequestException('Enter their email address')
    if (!isRole(body.role))
      throw new BadRequestException(`Role must be one of: ${ROLE_ORDER.join(', ')}`)
    const role = body.role
    if (!KINDS[role].includes(ws.kind))
      throw new BadRequestException('That role cannot be given at this kind of workspace')
    if (!allowed.includes(role)) throw new ForbiddenException('You cannot give that role here')

    let cohortId: string | null = null
    if (role === ROLES.instructor) {
      if (typeof body.cohortId !== 'string' || !body.cohortId)
        throw new BadRequestException('Choose the cohort they teach')
      const cohort = await this.prisma.cohort.findFirst({
        where: { id: body.cohortId, institutionId: ws.id },
        select: { id: true },
      })
      if (!cohort) throw new NotFoundException('That cohort is not in this workspace')
      cohortId = cohort.id
    } else if (body.cohortId) {
      throw new BadRequestException('Only an instructor is tied to a cohort')
    }

    const user = await this.prisma.user.findFirst({
      where: { email, source: 'learn' },
      select: { id: true, displayName: true, email: true },
    })
    // No account yet: keep the role for that address; it becomes theirs when they first open Learn Differently.
    if (!user)
      return { status: 'invited', invite: await this.invite(actor, ws.id, email, role, cohortId) }
    if (user.id === actor.userId && !this.access.isSystemAdmin(actor))
      throw new ConflictException('You cannot change your own access')

    const where = { userId: user.id, institutionId: ws.id, cohortId }
    const row = await this.setRole(where, role)
    return {
      status: 'added',
      member: {
        membershipId: row.id,
        userId: user.id,
        name: user.displayName ?? user.email ?? user.id,
        email: user.email,
        role,
        cohort: null,
      },
    }
  }

  /** Keeps a role for an address with no account yet; offering it again changes the role. */
  private async invite(
    actor: Actor,
    institutionId: string,
    email: string,
    role: Role,
    cohortId: string | null
  ): Promise<WorkspaceInvite> {
    const place = { email, institutionId, cohortId }
    const make = async () => {
      const existing = await this.prisma.roleInvite.findFirst({
        where: place,
        select: { id: true },
      })
      return existing
        ? this.prisma.roleInvite.update({
            where: { id: existing.id },
            data: { role, invitedById: actor.userId },
            include: { cohort: { select: { id: true, name: true } } },
          })
        : null
    }
    let row = await make()
    if (!row) {
      try {
        row = await this.prisma.roleInvite.create({
          data: { ...place, role, invitedById: actor.userId },
          include: { cohort: { select: { id: true, name: true } } },
        })
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err
        row = await make()
        if (!row) throw err
      }
    }
    return {
      inviteId: row.id,
      email: row.email,
      role,
      cohort: row.cohort,
      createdAt: row.createdAt.toISOString(),
    }
  }

  /** Withdraws an invitation the caller could have given. */
  async revokeInvite(actor: Actor, subdomain: string, inviteId: string): Promise<void> {
    const allowed = await this.grantableAt(actor, subdomain)
    const ws = await this.workspace(subdomain)
    const row = await this.prisma.roleInvite.findFirst({
      where: { id: inviteId, institutionId: ws.id },
      select: { id: true, role: true },
    })
    if (!row || !isRole(row.role)) throw new NotFoundException('Not found')
    if (!allowed.includes(row.role)) throw new ForbiddenException('You cannot remove that role')
    await this.prisma.roleInvite.delete({ where: { id: row.id } })
  }

  /**
   * Turns the invitations for this person's verified email into roles. Called when they open Learn Differently,
   * before the workspaces are listed. It runs with no agency of its own because the person has none yet; the
   * invitations were made by someone allowed to give those roles, and Clerk has verified the address.
   */
  async claimFor(userId: string): Promise<void> {
    if ((await runAsSystem(() => this.prisma.roleInvite.count())) === 0) return
    const email = await this.clerk.getVerifiedEmail(userId, 'learn')
    if (!email) return
    await runAsSystem(async () => {
      const invites = await this.prisma.roleInvite.findMany({ where: { email } })
      if (invites.length === 0) return
      await this.ensureUser(userId, email)
      for (const invite of invites) {
        if (!isRole(invite.role)) continue
        await this.setRole(
          { userId, institutionId: invite.institutionId, cohortId: invite.cohortId },
          invite.role
        )
        await this.prisma.roleInvite.deleteMany({ where: { id: invite.id } })
      }
    })
  }

  /** The User row mirrors the Clerk account; it is made the first time one is needed. */
  private async ensureUser(userId: string, email: string): Promise<void> {
    if (await this.prisma.user.findUnique({ where: { id: userId } })) return
    const profile = await this.clerk.getUserProfile(userId, 'learn')
    try {
      await this.prisma.user.create({
        data: { id: userId, source: 'learn', email, displayName: profile?.displayName ?? null },
      })
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err
      // the address is on another row: keep the account, leave the cached email off
      await this.prisma.user.create({
        data: { id: userId, source: 'learn', displayName: profile?.displayName ?? null },
      })
    }
  }

  /** Gives the role to the person's membership here, making it if there is none. Two at once end up as one row. */
  private async setRole(
    where: { userId: string; institutionId: string; cohortId: string | null },
    role: Role
  ) {
    const update = async () => {
      const existing = await this.prisma.membership.findFirst({ where, select: { id: true } })
      return existing
        ? this.prisma.membership.update({ where: { id: existing.id }, data: { role } })
        : null
    }
    const done = await update()
    if (done) return done
    try {
      return await this.prisma.membership.create({ data: { ...where, role } })
    } catch (err) {
      // someone else made it between the look and the create: the database allows one, so use theirs
      if ((err as { code?: string }).code !== 'P2002') throw err
      const again = await update()
      if (again) return again
      throw err
    }
  }

  /** Takes a role away. Only a role the caller may give, and never their own. */
  async revoke(actor: Actor, subdomain: string, membershipId: string): Promise<void> {
    const allowed = await this.grantableAt(actor, subdomain)
    const ws = await this.workspace(subdomain)
    const m = await this.prisma.membership.findFirst({
      where: { id: membershipId, institutionId: ws.id, role: { not: null } },
      select: { id: true, userId: true, role: true, cohortId: true },
    })
    if (!m || !isRole(m.role)) throw new NotFoundException('Not found')
    if (!allowed.includes(m.role)) throw new ForbiddenException('You cannot remove that role')
    if (m.userId === actor.userId && !this.access.isSystemAdmin(actor))
      throw new ConflictException('You cannot change your own access')
    // A cohort membership may also be the person's own, as a learner: take the role off and keep the row.
    if (m.cohortId)
      await this.prisma.membership.update({ where: { id: m.id }, data: { role: null } })
    else await this.prisma.membership.delete({ where: { id: m.id } })
  }
}
