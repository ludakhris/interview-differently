import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ClerkService } from './clerk.service'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Guard for admin-only endpoints.
 *
 * Verifies a Clerk Bearer JWT and confirms the user's `publicMetadata.role`
 * is `admin` (or `institution-admin`, when @InstitutionAdminAllowed() is set).
 *
 * Attaches `request.userId` and `request.userRole` so controllers can use them
 * without re-decoding the token. For institution-admins it also attaches
 * `request.institutionIds` (from their Membership rows) for InstitutionScope.
 *
 * Note: existing endpoints in this codebase don't use auth — they trust the
 * userId in the URL/body. This guard is the start of tightening that pattern;
 * apply it to new endpoints (institutions, cohorts, analytics) and retrofit
 * the rest later.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name)

  constructor(
    private readonly clerk: ClerkService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>
      userId?: string
      userRole?: string
      institutionIds?: string[]
    }>()

    const auth = request.headers['authorization'] ?? request.headers['Authorization']
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token')
    }
    const token = auth.slice('Bearer '.length).trim()
    const userId = await this.clerk.verifyBearerToken(token)
    if (!userId) {
      throw new UnauthorizedException('Invalid or expired token')
    }

    const role = await this.clerk.getRole(userId)
    const allowInstitutionAdmin = this.reflector.get<boolean>('allowInstitutionAdmin', context.getHandler())

    if (role === 'admin') {
      // Full admin always allowed.
    } else if (allowInstitutionAdmin && role === 'institution-admin') {
      const memberships = await this.prisma.membership.findMany({
        where: { userId },
        select: { institutionId: true },
        distinct: ['institutionId'],
      })
      request.institutionIds = memberships.map((m) => m.institutionId)
    } else {
      this.logger.debug(`Access denied for ${userId} (role=${role ?? 'none'})`)
      throw new ForbiddenException('Admin role required')
    }

    request.userId = userId
    request.userRole = role ?? undefined
    return true
  }
}

/**
 * Method decorator that lets institution-admins through AdminGuard alongside
 * full admins. Handlers that use it must scope by institution via
 * InstitutionScope — the guard only proves the role, not the binding.
 */
export const InstitutionAdminAllowed = () => SetMetadata('allowInstitutionAdmin', true)
