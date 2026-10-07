import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { LtiError } from '../lti-spec'
import { CLOSE_SCRIPT_CSP, errorPage, registeredPage } from './lti-tool.html'
import { ToolRegistrationService } from './registration.service'

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/**
 * LTI Dynamic Registration, tool side: `GET /api/lti/tool/register?openid_configuration=&registration_token=`.
 * Public, because the platform's admin opens it in their own browser. Answers an HTML page, never JSON.
 */
@Controller('lti/tool')
export class ToolRegistrationController {
  private readonly logger = new Logger(ToolRegistrationController.name)

  constructor(private readonly registration: ToolRegistrationService) {}

  @Get('register')
  async register(@Query() q: unknown, @Req() req: Request, @Res() res: Response) {
    const query = (typeof q === 'object' && q !== null ? q : {}) as Record<string, unknown>
    let status = 200
    let html: string
    let csp = "default-src 'none'; style-src 'unsafe-inline'"
    try {
      const out = await this.registration.register(
        {
          openid_configuration: str(query.openid_configuration),
          registration_token: str(query.registration_token),
        },
        req.ip
      )
      html = registeredPage(out.name, out.created)
      csp = CLOSE_SCRIPT_CSP
    } catch (err) {
      if (err instanceof LtiError) {
        status = err.status
        html = errorPage(err.message)
      } else {
        // the message is not shown, and the token is in the URL: log neither
        this.logger.error(`Registration failed: ${err instanceof Error ? err.name : 'unknown'}`)
        status = 500
        html = errorPage('Registration failed. Try again later.')
      }
    }
    res.status(status).set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': csp,
    })
    res.send(html)
  }
}
