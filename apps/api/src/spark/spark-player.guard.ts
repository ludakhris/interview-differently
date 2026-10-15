import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { identifyCaller } from '../core/tenant-context'
import {
  PLAYER_BEARER_PREFIX,
  verifyPlayerToken,
  verifyPreviewToken,
  type SparkLink,
} from './player-token'

export interface SparkPlayerRequest {
  headers: Record<string, string | string[] | undefined>
  sparkPlayer?: SparkLink
}

/**
 * Spark's player routes take only a signed lesson link (`Authorization: Bearer spark.<token>`), never a Clerk
 * session. The learner in the token is who the request acts as, so row-level security lets them read and add to
 * their own lesson rows and nothing else. A reviewer's preview link (PreviewToken) acts as the reviewer and reads only
 * the Lesson library row; it records nothing.
 */
@Injectable()
export class SparkPlayerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<SparkPlayerRequest>()
    const raw = req.headers['authorization']
    const auth = Array.isArray(raw) ? raw[0] : raw
    const bearer = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : ''
    const link = bearer.startsWith(PLAYER_BEARER_PREFIX)
      ? bearer.slice(PLAYER_BEARER_PREFIX.length)
      : null
    const token = link === null ? null : (verifyPlayerToken(link) ?? verifyPreviewToken(link))
    if (!token)
      throw new UnauthorizedException(
        'This lesson link has expired. Open it again from your course.'
      )
    identifyCaller({ userId: token.sub })
    req.sparkPlayer = token
    return true
  }
}
