import { Injectable, Logger } from '@nestjs/common'
import { createClerkClient, verifyToken, type ClerkClient } from '@clerk/backend'

/**
 * Thin wrapper around the Clerk backend SDK.
 *
 * Provides:
 *   - verifyBearerToken(token) — validates a JWT and returns the Clerk userId
 *   - isAdmin(userId)         — checks publicMetadata.role on the Clerk user
 *
 * The API has historically had no server-side auth (every endpoint trusted
 * userIds passed in URLs/bodies). This service is the entry point for
 * tightening that — start with new endpoints, retrofit the rest later.
 */
@Injectable()
export class ClerkService {
  private readonly logger = new Logger(ClerkService.name)
  private readonly client: ClerkClient | null
  private readonly secretKey: string | null

  constructor() {
    this.secretKey = process.env.CLERK_SECRET_KEY ?? null
    if (!this.secretKey) {
      this.client = null
      this.logger.warn('CLERK_SECRET_KEY not set — auth checks will reject all requests')
      return
    }
    this.client = createClerkClient({ secretKey: this.secretKey })
  }

  /** Returns the Clerk userId from a Bearer JWT, or null if invalid/expired/missing key. */
  async verifyBearerToken(token: string): Promise<string | null> {
    if (!this.secretKey) return null
    try {
      const payload = await verifyToken(token, { secretKey: this.secretKey })
      return payload.sub ?? null
    } catch (err) {
      this.logger.debug(`Token verification failed: ${err instanceof Error ? err.message : 'unknown'}`)
      return null
    }
  }

  /** True if the user's Clerk publicMetadata.role === 'admin'. Same flag the builder uses. */
  async isAdmin(userId: string): Promise<boolean> {
    if (!this.client) return false
    try {
      const user = await this.client.users.getUser(userId)
      const role = (user.publicMetadata as { role?: string } | null)?.role
      return role === 'admin'
    } catch (err) {
      this.logger.warn(`Failed to fetch Clerk user ${userId}: ${err instanceof Error ? err.message : 'unknown'}`)
      return false
    }
  }
}
