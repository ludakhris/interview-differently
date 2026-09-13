import { Controller, Get, Patch, Body, HttpCode, UseGuards } from '@nestjs/common'
import { PlatformConfigService } from './platform-config.service'
import { AdminGuard } from '../auth/admin.guard'

@Controller()
export class PlatformConfigController {
  constructor(private readonly svc: PlatformConfigService) {}

  @Get('config')
  getPublic() {
    return this.svc.getPublic()
  }

  /** Full-admin only — platform-wide switches, not institution-scoped. */
  @Patch('admin/config')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  async set(@Body() body: { key: string; value: string }) {
    await this.svc.set(body.key, body.value)
  }
}
