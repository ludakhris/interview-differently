import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AdminGuard } from '../../auth/admin.guard'
import { ClerkService } from '../../auth/clerk.service'
import { jwksUrl, launchUrl, loginUrl, registrationUrl } from './lti-tool.config'
import { PlatformRegistryService } from './platform-registry.service'

interface AdminRequest {
  userId: string
}

/**
 * The platforms that launch Interview Differently: who is waiting for approval, who is on. Full
 * admins only (AdminGuard without InstitutionAdminAllowed): switching a platform on lets it send
 * learners here.
 */
@Controller('lti/platforms')
@UseGuards(AdminGuard)
export class PlatformsController {
  constructor(
    private readonly platforms: PlatformRegistryService,
    private readonly clerk: ClerkService
  ) {}

  @Get()
  async list() {
    return {
      platforms: await this.platforms.list(),
      // the real public addresses a platform administrator pastes into their platform
      endpoints: {
        registrationUrl: registrationUrl(),
        loginUrl: loginUrl(),
        launchUrl: launchUrl(),
        jwksUrl: jwksUrl(),
      },
    }
  }

  // before `:id`, so "history" is never read as a platform id
  @Get('history')
  async history(@Query('subjectId') subjectId?: string) {
    return { changes: await this.platforms.history(subjectId || undefined) }
  }

  @Delete(':id')
  async reject(@Req() req: AdminRequest, @Param('id') id: string) {
    await this.platforms.reject(await this.who(req.userId), id)
    return { ok: true }
  }

  private async who(userId: string) {
    const p = await this.clerk.getUserProfile(userId)
    return { userId, userName: p?.displayName?.trim() || p?.email || userId }
  }

  @Put(':id')
  async setEnabled(@Req() req: AdminRequest, @Param('id') id: string, @Body() body: unknown) {
    const enabled = (body as { enabled?: unknown } | null)?.enabled
    if (typeof enabled !== 'boolean') throw new BadRequestException('enabled must be true or false')
    return this.platforms.setEnabled(await this.who(req.userId), id, enabled)
  }
}
