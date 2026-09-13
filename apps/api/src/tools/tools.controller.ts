import { Body, Controller, Get, HttpCode, Param, Put, Req, UseGuards } from '@nestjs/common'
import { AdminGuard, InstitutionAdminAllowed } from '../auth/admin.guard'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { InstitutionScope, type AdminRequest } from '../auth/scope'
import { ToolsService } from './tools.service'

interface AuthedRequest {
  userId: string
}

@Controller('admin/cohorts/:cohortId/tools')
@UseGuards(AdminGuard)
export class ToolsAdminController {
  constructor(
    private readonly service: ToolsService,
    private readonly scope: InstitutionScope,
  ) {}

  @Get()
  @InstitutionAdminAllowed()
  async list(@Req() req: AdminRequest, @Param('cohortId') cohortId: string) {
    await this.scope.assertCohort(req, cohortId)
    return this.service.listForCohort(cohortId)
  }

  @Put(':toolKey')
  @HttpCode(204)
  @InstitutionAdminAllowed()
  async set(
    @Req() req: AdminRequest,
    @Param('cohortId') cohortId: string,
    @Param('toolKey') toolKey: string,
    @Body() body: { enabled: boolean },
  ): Promise<void> {
    await this.scope.assertCohort(req, cohortId)
    await this.service.setForCohort(cohortId, toolKey, body.enabled)
  }
}

@Controller('me/tools')
@UseGuards(AuthenticatedGuard)
export class ToolsMeController {
  constructor(private readonly service: ToolsService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.service.listForUser(req.userId)
  }
}
