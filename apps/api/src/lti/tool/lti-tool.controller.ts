import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { LtiError } from '../lti-spec'
import { returnUrl } from './lti-tool.config'
import { errorPage } from './lti-tool.html'
import { LtiOnlyGuard, type LtiRequest } from './lti-session.guard'
import { LtiPlayService } from './lti-play.service'
import { LtiReturnError, LtiToolService } from './lti-tool.service'

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
  constructor(
    private readonly tool: LtiToolService,
    private readonly play: LtiPlayService
  ) {}

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
      if (typeof page === 'string') this.send(res, 200, page)
      else res.redirect(303, page.redirect)
    })
  }

  @Post('submit')
  submit(@Body() b: unknown, @Res() res: Response) {
    return this.html(res, async () => {
      const { status, html } = await this.tool.submit(strings(b))
      this.send(res, status, html)
    })
  }

  /** What the web app needs to render the launch: the tenant's brand tokens (or null) and the scenario ref. */
  @Get('session')
  @UseGuards(LtiOnlyGuard)
  session(@Req() req: LtiRequest) {
    const { brand, ref, deliveryId } = req.lti!
    return { brand: brand ?? null, ref, ...(deliveryId ? { deliveryId } : {}) }
  }

  /**
   * Posts the score of a finished play; the LTI session is the credential, and nothing in the body
   * is a score. `{play}` is a text simulation, scored here from the answers `/play` recorded;
   * `{sessionId}` an immersive (voice) interview scored here; `{attemptId}` a submitted
   * assessment attempt graded server-side.
   */
  @Post('complete')
  @UseGuards(LtiOnlyGuard)
  async complete(@Req() req: LtiRequest, @Body() b: unknown) {
    return this.asHttp(async () => {
      const session = this.ltiSession(req)
      const p = strings(b)
      if (p.attemptId !== undefined) return this.tool.completeAssessment(session, p.attemptId)
      if (p.sessionId !== undefined) return this.tool.completeImmersive(session, p.sessionId)
      if (p.play !== undefined) return this.play.complete(session)
      throw new LtiError('Missing attemptId, sessionId or play')
    })
  }

  // ── A launched text simulation: the browser shows the case, the server grades each answer ──

  /** Where the play is and what has been answered, so a reload picks it up again. */
  @Get('play')
  @UseGuards(LtiOnlyGuard)
  playView(@Req() req: LtiRequest) {
    return this.asHttp(() => this.play.view(this.ltiSession(req)))
  }

  @Post('play/choice')
  @UseGuards(LtiOnlyGuard)
  playChoice(@Req() req: LtiRequest, @Body() b: unknown) {
    const p = strings(b)
    return this.asHttp(() => this.play.choose(this.ltiSession(req), p.nodeId, p.choiceId))
  }

  @Post('play/quant')
  @UseGuards(LtiOnlyGuard)
  playQuant(@Req() req: LtiRequest, @Body() b: unknown) {
    const body = typeof b === 'object' && b !== null ? (b as Record<string, unknown>) : {}
    return this.asHttp(() => this.play.grantQuant(this.ltiSession(req), body.nodeId, body.answer))
  }

  @Post('play/sql')
  @UseGuards(LtiOnlyGuard)
  playSql(@Req() req: LtiRequest, @Body() b: unknown) {
    const p = strings(b)
    return this.asHttp(() => this.play.gradeSql(this.ltiSession(req), p.nodeId, p.sql))
  }

  @Post('play/hint')
  @UseGuards(LtiOnlyGuard)
  playHint(@Req() req: LtiRequest, @Body() b: unknown) {
    const p = strings(b)
    return this.asHttp(() => this.play.hint(this.ltiSession(req), p.nodeId))
  }

  private ltiSession(req: LtiRequest) {
    return { ...req.lti!, sub: req.userId! }
  }

  /** Turns a protocol error into an HTTP error with its status. */
  private async asHttp<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof LtiError) throw new HttpException(err.message, err.status)
      throw err
    }
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
      this.send(
        res,
        err.status,
        errorPage(err.message, err instanceof LtiReturnError ? err.returnUrl : returnUrl())
      )
    }
  }
}
