import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ClerkService, type ClerkUserSummary } from '../auth/clerk.service'
import { LEARN_ROLE_ORDER, LEARN_ROLES, LearnService } from './learn.service'

/**
 * System admin tool: change which LearnDifferently role a user holds
 * (Clerk `publicMetadata.role` on the LearnDifferently instance). A user holds
 * one role, or none. The assignable roles are whatever LEARN_ROLES defines.
 */
@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name)

  constructor(
    private readonly clerk: ClerkService,
    private readonly learn: LearnService
  ) {}

  /** Assignable roles, least access first. A role missing from LEARN_ROLE_ORDER sorts lowest. */
  roles(actorRole: string | undefined): string[] {
    this.learn.assertRole(actorRole, [LEARN_ROLES.systemAdmin])
    const unranked = Object.values<string>(LEARN_ROLES).filter((r) => !LEARN_ROLE_ORDER.includes(r))
    return [...unranked, ...LEARN_ROLE_ORDER]
  }

  search(actorRole: string | undefined, query: string | undefined): Promise<ClerkUserSummary[]> {
    this.learn.assertRole(actorRole, [LEARN_ROLES.systemAdmin])
    return this.clerk.searchUsers((query ?? '').trim(), 'learn')
  }

  /** Sets the user's role, or clears it with null. */
  async setRole(
    actorId: string,
    actorRole: string | undefined,
    targetId: string,
    role: string | null
  ): Promise<ClerkUserSummary> {
    this.learn.assertRole(actorRole, [LEARN_ROLES.systemAdmin])
    const allowed: string[] = Object.values(LEARN_ROLES)
    if (role !== null && !allowed.includes(role)) {
      throw new BadRequestException(`Role must be one of: ${allowed.join(', ')} (or null to clear)`)
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
