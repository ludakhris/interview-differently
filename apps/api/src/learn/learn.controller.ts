import { Controller, Get, Header, Param, Query, Req, UseGuards } from '@nestjs/common'
import { LearnGuard } from '../auth/learn.guard'
import { LEARN_ROLES, LearnService } from './learn.service'

interface LearnRequest {
  userId: string
  userRole?: string
}

const READERS = [LEARN_ROLES.agencyAdmin, LEARN_ROLES.caseManager, LEARN_ROLES.providerAdmin]

/**
 * Reporting for LearnDifferently workspaces. `?tenant=delaware` names the
 * workspace; every call checks the caller may open it (agency admins: every
 * agency; others: agencies they hold a membership in). Case managers can read
 * outcomes and gradebooks but not the exit file. Providers see their own results.
 */
@Controller('learn')
@UseGuards(LearnGuard)
export class LearnController {
  constructor(private readonly service: LearnService) {}

  /** Workspaces the signed-in person may open. */
  @Get('workspaces')
  workspaces(@Req() req: LearnRequest) {
    return this.service.workspaces(req.userId, req.userRole)
  }

  /** The same workspaces with their counts, for the chooser page. */
  @Get('workspaces/summary')
  workspaceSummaries(@Req() req: LearnRequest) {
    return this.service.workspaceSummaries(req.userId, req.userRole)
  }

  @Get('agency/outcomes')
  async outcomes(@Req() req: LearnRequest, @Query('tenant') tenant: string) {
    this.service.assertRole(req.userRole, READERS)
    await this.service.assertWorkspace(req.userId, req.userRole, tenant)
    return this.service.outcomes(tenant)
  }

  @Get('agency/cohorts/:cohortId/gradebook')
  async gradebook(
    @Req() req: LearnRequest,
    @Query('tenant') tenant: string,
    @Param('cohortId') cohortId: string
  ) {
    this.service.assertRole(req.userRole, READERS)
    await this.service.assertWorkspace(req.userId, req.userRole, tenant)
    return this.service.gradebook(tenant, cohortId)
  }

  @Get('agency/exit-file.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="exit-file.csv"')
  async exitFile(@Req() req: LearnRequest, @Query('tenant') tenant: string) {
    this.service.assertRole(req.userRole, [LEARN_ROLES.agencyAdmin, LEARN_ROLES.providerAdmin])
    await this.service.assertWorkspace(req.userId, req.userRole, tenant)
    return this.service.exitFile(tenant)
  }
}
