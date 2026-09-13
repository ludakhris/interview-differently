import { ForbiddenException } from '@nestjs/common'
import { ClerkService } from './clerk.service'

/** Request shape after AuthenticatedGuard. */
export interface AuthedRequest {
  userId: string
}

/**
 * Own-data check for student endpoints (#27): the caller must be the row's
 * owner, or a full admin. Institution-admins read student data through the
 * scoped analytics endpoints instead.
 */
export async function assertOwnerOrAdmin(clerk: ClerkService, req: AuthedRequest, ownerUserId: string): Promise<void> {
  if (ownerUserId === req.userId) return
  if (await clerk.isAdmin(req.userId)) return
  throw new ForbiddenException('Not authorised to access this record')
}
