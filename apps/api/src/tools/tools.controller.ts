import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common'
import { AdminGuard, InstitutionAdminAllowed } from '../auth/admin.guard'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { InstitutionScope, type AdminRequest } from '../auth/scope'
import { ToolsService, type SandboxQueryInput } from './tools.service'

interface AuthedRequest {
  userId: string
}

@Controller('admin/cohorts/:cohortId/tools')
@UseGuards(AdminGuard)
export class ToolsAdminController {
  constructor(
    private readonly service: ToolsService,
    private readonly scope: InstitutionScope
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
    @Body() body: { enabled: boolean }
  ): Promise<void> {
    await this.scope.assertCohort(req, cohortId)
    await this.service.setForCohort(cohortId, toolKey, body.enabled)
  }
}

/** Live monitor: who in a cohort is running what in the SQL sandbox. */
@Controller('admin/cohorts/:cohortId/sandbox-activity')
@UseGuards(AdminGuard)
export class SandboxActivityController {
  constructor(
    private readonly service: ToolsService,
    private readonly scope: InstitutionScope
  ) {}

  @Get()
  @InstitutionAdminAllowed()
  async get(@Req() req: AdminRequest, @Param('cohortId') cohortId: string) {
    await this.scope.assertCohort(req, cohortId)
    return this.service.sandboxActivity(cohortId)
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

  @Post('sandbox-queries')
  @HttpCode(204)
  async logQuery(@Req() req: AuthedRequest, @Body() body: SandboxQueryInput): Promise<void> {
    await this.service.logSandboxQuery(req.userId, body)
  }
}
