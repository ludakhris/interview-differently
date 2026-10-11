import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ClerkService, type ClerkUserSummary } from '../auth/clerk.service'
import { AccessService } from './access/access.service'
import { SYSTEM_ADMIN } from './access/permissions'

/**
 * System admin tool: make someone a platform administrator, or take it away (Clerk `publicMetadata.role` on
 * the LearnDifferently instance). It is the only role kept on the account: every other role is a membership
 * at a workspace (members.service.ts, GitHub issue #84). A person may still carry an older account role until
 * their access has been moved onto memberships; it can be cleared here but not given.
 */
@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name)

  constructor(
    private readonly clerk: ClerkService,
    private readonly access: AccessService
  ) {}

  /** The roles that can be given on an account: only the platform administrator. */
  roles(actorRole: string | undefined): string[] {
    this.access.requireSystemAdmin({ userId: '', role: actorRole })
    return [SYSTEM_ADMIN]
  }

  search(actorRole: string | undefined, query: string | undefined): Promise<ClerkUserSummary[]> {
    this.access.requireSystemAdmin({ userId: '', role: actorRole })
    return this.clerk.searchUsers((query ?? '').trim(), 'learn')
  }

  /** Sets the user's role, or clears it with null. */
  async setRole(
    actorId: string,
    actorRole: string | undefined,
    targetId: string,
    role: string | null
  ): Promise<ClerkUserSummary> {
    this.access.requireSystemAdmin({ userId: actorId, role: actorRole })
    if (role !== null && role !== SYSTEM_ADMIN) {
      throw new BadRequestException(
        `Only ${SYSTEM_ADMIN} can be given on an account (or null to clear). Give other roles at a workspace.`
      )
    }
    // Self-changes are blocked so the platform can never lose its last system admin.
    if (targetId === actorId) throw new BadRequestException('You cannot change your own role')
    const target = await this.clerk.getUserSummary(targetId, 'learn')
    if (!target) throw new NotFoundException(`User ${targetId} not found`)
    await this.clerk.setRole(targetId, role, 'learn')
    this.logger.log(
      `${actorId} changed role of ${targetId} (${target.email ?? 'no email'}): ${target.role ?? 'none'} -> ${role ?? 'none'}`
    )
    return { ...target, role }
  }
}
