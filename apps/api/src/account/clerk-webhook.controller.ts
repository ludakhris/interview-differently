import { Controller, HttpCode, Logger, Post, Req, UnauthorizedException } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import type { Request } from 'express'
import { verifyWebhook } from '@clerk/backend/webhooks'
import { AccountService } from './account.service'

/**
 * Clerk → us. `user.deleted` (account removed from the Clerk dashboard or by
 * the user) triggers the same erasure as DELETE /me/account, so our copy
 * never outlives the identity. Configure in Clerk: endpoint
 * `<API_URL>/api/webhooks/clerk`, event `user.deleted`, and set
 * CLERK_WEBHOOK_SIGNING_SECRET. The raw body is required for the signature
 * check — main.ts mounts express.raw() on this path.
 */
@Controller('webhooks/clerk')
@SkipThrottle()
export class ClerkWebhookController {
  private readonly logger = new Logger(ClerkWebhookController.name)

  constructor(private readonly account: AccountService) {}

  @Post()
  @HttpCode(204)
  async handle(@Req() req: Request): Promise<void> {
    const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET
    if (!secret) throw new UnauthorizedException('Webhook not configured')

    let evt
    try {
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') headers.set(k, v)
      }
      const request = new Request('http://internal/webhook', {
        method: 'POST',
        headers,
        body: new Uint8Array(req.body as Buffer),
      })
      evt = await verifyWebhook(request, { signingSecret: secret })
    } catch (err) {
      this.logger.warn(`Rejected webhook: ${err instanceof Error ? err.message : 'invalid'}`)
      throw new UnauthorizedException('Invalid webhook signature')
    }

    if (evt.type === 'user.deleted' && evt.data.id) {
      await this.account.eraseUserData(evt.data.id)
    }
  }
}
