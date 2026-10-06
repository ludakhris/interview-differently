import { Body, Controller, Get, Headers, Post, Query, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { LtiError } from '../lti-spec'
import { returnUrl } from './lti-tool.config'
import { errorPage } from './lti-tool.html'
import { LtiToolService } from './lti-tool.service'

type Params = Record<string, string | undefined>

const STATE_COOKIE = 'lti_state'
const COOKIE_ATTRS = 'HttpOnly; Secure; SameSite=None; Path=/api/lti/tool'

/** Keeps only string values; anything else (objects, arrays, numbers) reads as missing. */
function strings(input: unknown): Params {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return {}
  return Object.fromEntries(Object.entries(input).filter(([, v]) => typeof v === 'string'))
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return undefined
}

/** Interview Differently as an LTI 1.3 tool. Pages are plain server-rendered HTML. */
@Controller('lti/tool')
export class LtiToolController {
  constructor(private readonly tool: LtiToolService) {}

  @Get('jwks')
  jwks() {
    return this.tool.jwks()
  }

  @Get('login')
  loginGet(@Query() q: unknown, @Req() req: Request, @Res() res: Response) {
    return this.html(res, () => this.redirect(res, strings(q), req.ip))
  }

  @Post('login')
  loginPost(@Body() b: unknown, @Req() req: Request, @Res() res: Response) {
    return this.html(res, () => this.redirect(res, strings(b), req.ip))
  }

  @Post('launch')
  launch(@Body() b: unknown, @Headers('cookie') cookie: string | undefined, @Res() res: Response) {
    return this.html(res, async () => {
      const p = strings(b)
      const page = await this.tool.launch(p.id_token, p.state, cookieValue(cookie, STATE_COOKIE))
      res.setHeader('Set-Cookie', `${STATE_COOKIE}=; ${COOKIE_ATTRS}; Max-Age=0`)
      this.send(res, 200, page)
    })
  }

  @Post('submit')
  submit(@Body() b: unknown, @Res() res: Response) {
    return this.html(res, async () => {
      const { status, html } = await this.tool.submit(strings(b))
      this.send(res, status, html)
    })
  }

  /** Binds the login to this browser with a cookie holding the state, then sends it to the platform. */
  private async redirect(res: Response, p: Params, ip: string | undefined) {
    const { url, state } = await this.tool.login(p, ip)
    res.setHeader('Set-Cookie', `${STATE_COOKIE}=${state}; ${COOKIE_ATTRS}; Max-Age=600`)
    res.redirect(302, url)
  }

  private send(res: Response, status: number, html: string) {
    res.status(status).set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    })
    res.send(html)
  }

  /** Runs a handler and turns protocol errors into an HTML error page. */
  private async html(res: Response, fn: () => unknown) {
    try {
      await fn()
    } catch (err) {
      if (!(err instanceof LtiError)) throw err
      this.send(res, err.status, errorPage(err.message, returnUrl()))
    }
  }
}
