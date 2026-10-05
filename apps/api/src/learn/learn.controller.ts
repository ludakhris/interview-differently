import { Controller, Get, Header, Param, Query, Req, UseGuards } from '@nestjs/common'
import { LearnGuard } from '../auth/learn.guard'
import { LEARN_ROLES, LearnService } from './learn.service'

interface LearnRequest {
  userId: string
  userRole?: string
}

const READERS = [LEARN_ROLES.agencyAdmin, LEARN_ROLES.caseManager]

/**
 * Agency reporting for a LearnDifferently tenant, e.g. ?tenant=delaware.
 * Agency admins see everything; case managers get the same reads (outcomes
 * and gradebooks) but not the exit file. Demo-grade scoping: the tenant comes
 * from the query, not from the caller's membership.
 */
@Controller('learn/agency')
@UseGuards(LearnGuard)
export class LearnController {
  constructor(private readonly service: LearnService) {}

  @Get('outcomes')
  outcomes(@Req() req: LearnRequest, @Query('tenant') tenant: string) {
    this.service.assertRole(req.userRole, READERS)
    return this.service.outcomes(tenant)
  }

  @Get('cohorts/:cohortId/gradebook')
  gradebook(
    @Req() req: LearnRequest,
    @Query('tenant') tenant: string,
    @Param('cohortId') cohortId: string
  ) {
    this.service.assertRole(req.userRole, READERS)
    return this.service.gradebook(tenant, cohortId)
  }

  @Get('exit-file.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="exit-file.csv"')
  exitFile(@Req() req: LearnRequest, @Query('tenant') tenant: string) {
    this.service.assertRole(req.userRole, [LEARN_ROLES.agencyAdmin])
    return this.service.exitFile(tenant)
  }
}
