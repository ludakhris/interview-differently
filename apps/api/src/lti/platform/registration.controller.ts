import { Body, Controller, Get, Header, HttpCode, Post, Req } from '@nestjs/common'
import { platformConfiguration } from './dynamic-registration'
import { RegistrationService } from './registration.service'

interface RawRequest {
  ip?: string
  headers: Record<string, string | undefined>
}

/**
 * LTI Dynamic Registration (platform side): the configuration a registering tool reads, and the
 * endpoint it posts its own configuration to. The second needs a one-time token a system admin issued.
 */
@Controller('lti/platform')
export class RegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  @Get('openid-configuration')
  @Header('Cache-Control', 'no-store')
  configuration() {
    return platformConfiguration()
  }

  @Post('registration')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  register(@Req() req: RawRequest, @Body() body: unknown) {
    return this.registration.register(req.headers['authorization'], body, req.ip)
  }
}
