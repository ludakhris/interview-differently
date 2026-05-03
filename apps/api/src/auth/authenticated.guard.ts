import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { ClerkService } from './clerk.service'

/**
 * Guard for endpoints that require *any* signed-in user (no role check).
 *
 * Verifies the Clerk Bearer token and attaches `request.userId`. Use this
 * for endpoints like `/me/*` where the action is scoped to the caller's
 * own data — pair with controller logic that filters by `request.userId`.
 *
 * For admin-only endpoints, use `AdminGuard` instead.
 */
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(private readonly clerk: ClerkService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>
      userId?: string
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

    request.userId = userId
    return true
  }
}
