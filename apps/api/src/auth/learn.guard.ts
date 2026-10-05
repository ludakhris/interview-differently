import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { ClerkService, type UserSource } from './clerk.service'

/**
 * Guard for LearnDifferently endpoints. Verifies a Bearer token issued by the
 * LearnDifferently Clerk instance (never Interview Differently's) and attaches
 * `userId`, `userSource` ('learn') and the user's role from that instance.
 * Roles are checked by the controller, e.g. 'agency-admin'.
 */
@Injectable()
export class LearnGuard implements CanActivate {
  constructor(private readonly clerk: ClerkService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>
      userId?: string
      userSource?: UserSource
      userRole?: string
    }>()

    const auth = request.headers['authorization'] ?? request.headers['Authorization']
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token')
    }
    const userId = await this.clerk.verifyLearnToken(auth.slice('Bearer '.length).trim())
    if (!userId) throw new UnauthorizedException('Invalid or expired token')

    request.userId = userId
    request.userSource = 'learn'
    request.userRole = (await this.clerk.getRole(userId, 'learn')) ?? undefined
    return true
  }
}
