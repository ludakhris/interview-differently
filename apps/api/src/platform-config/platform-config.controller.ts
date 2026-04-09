import { Controller, Get, Patch, Body, HttpCode } from '@nestjs/common'
import { PlatformConfigService } from './platform-config.service'

@Controller()
export class PlatformConfigController {
  constructor(private readonly svc: PlatformConfigService) {}

  @Get('config')
  getPublic() {
    return this.svc.getPublic()
  }

  @Patch('admin/config')
  @HttpCode(204)
  async set(@Body() body: { key: string; value: string }) {
    await this.svc.set(body.key, body.value)
  }
}
