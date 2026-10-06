import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req } from '@nestjs/common'
import { SCORE_CONTENT_TYPE } from '../lti-spec'
import { LtiPlatformService } from './lti-platform.service'

interface RawRequest {
  ip?: string
  headers: Record<string, string | undefined>
  [Symbol.asyncIterator](): AsyncIterator<Buffer | string>
}

/** The JSON body of a score, accepted only as the LTI score media type (which Express's JSON parser skips, so read it here). */
async function scoreBody(req: RawRequest): Promise<unknown> {
  const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (type !== SCORE_CONTENT_TYPE) return undefined
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    const b = Buffer.from(c)
    size += b.length
    if (size > 100_000) return undefined
    chunks.push(b)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}

/** The platform side of LTI 1.3: keys, the OIDC launch step, tokens, and score return (AGS). */
@Controller('lti/platform')
export class LtiPlatformController {
  constructor(private readonly platform: LtiPlatformService) {}

  @Get('jwks')
  jwks() {
    return this.platform.jwks()
  }

  @Get('auth')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  authGet(@Query() params: Record<string, unknown>, @Req() req: RawRequest) {
    return this.platform.authenticate(params, req.ip)
  }

  @Post('auth')
  @HttpCode(200)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  authPost(@Body() params: Record<string, unknown>, @Req() req: RawRequest) {
    return this.platform.authenticate(params, req.ip)
  }

  @Post('token')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  token(@Body() body: Record<string, unknown>) {
    return this.platform.token(body)
  }

  @Post('ags/:cohortId/lineitems/:itemId/scores')
  @HttpCode(200)
  async scores(
    @Req() req: RawRequest,
    @Param('cohortId') cohortId: string,
    @Param('itemId') itemId: string
  ) {
    return this.platform.receiveScore(
      req.headers['authorization'],
      cohortId,
      itemId,
      await scoreBody(req)
    )
  }
}
