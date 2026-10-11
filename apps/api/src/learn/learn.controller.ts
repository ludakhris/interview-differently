import { Controller, Get, Header, Param, Query, Req, UseGuards } from '@nestjs/common'
import { LearnGuard } from '../auth/learn.guard'
import { Access, SelfOnly } from './access/access.decorator'
import { MembersService } from './members.service'
import { LearnService } from './learn.service'

interface LearnRequest {
  userId: string
  userRole?: string
}

/**
 * Reporting for LearnDifferently workspaces. `?tenant=delaware` names the
 * workspace; every call checks the caller may open it (agency admins: every
 * agency; others: agencies they hold a membership in). Case managers can read
 * outcomes and gradebooks but not the exit file. Providers see their own results.
 */
@Controller('learn')
@UseGuards(LearnGuard)
export class LearnController {
  constructor(
    private readonly service: LearnService,
    private readonly members: MembersService
  ) {}

  /** Workspaces the signed-in person may open. */
  @Get('workspaces')
  @SelfOnly()
  async workspaces(@Req() req: LearnRequest) {
    // Roles offered to this person's email before they had an account become theirs here.
    await this.members.claimFor(req.userId)
    return this.service.workspaces(req.userId, req.userRole)
  }

  /** The same workspaces with their counts, for the chooser page. */
  @Get('workspaces/summary')
  @SelfOnly()
  async workspaceSummaries(@Req() req: LearnRequest) {
    await this.members.claimFor(req.userId)
    return this.service.workspaceSummaries(req.userId, req.userRole)
  }

  @Get('agency/outcomes')
  @Access('outcomes.read')
  outcomes(@Req() req: LearnRequest, @Query('tenant') tenant: string) {
    return this.service.outcomes({ userId: req.userId, role: req.userRole }, tenant)
  }

  @Get('agency/cohorts/:cohortId/gradebook')
  @Access('gradebook.read')
  gradebook(
    @Req() req: LearnRequest,
    @Query('tenant') tenant: string,
    @Param('cohortId') cohortId: string
  ) {
    return this.service.gradebook({ userId: req.userId, role: req.userRole }, tenant, cohortId)
  }

  @Get('agency/exit-file.csv')
  @Access('exit-file.read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="exit-file.csv"')
  exitFile(@Req() req: LearnRequest, @Query('tenant') tenant: string) {
    return this.service.exitFile({ userId: req.userId, role: req.userRole }, tenant)
  }
}
