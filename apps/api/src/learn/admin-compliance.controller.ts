import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { LearnGuard } from '../auth/learn.guard'
import { Access } from './access/access.decorator'
import { AdminComplianceService } from './admin-compliance.service'

/** System admin toolbox: Compliance, each governing agency's requirements on us and where we stand. */
@Controller('learn/admin/compliance')
@UseGuards(LearnGuard)
export class AdminComplianceController {
  constructor(private readonly compliance: AdminComplianceService) {}

  @Get()
  @Access('platform.admin')
  frameworks(@Req() req: { userRole?: string }) {
    return this.compliance.frameworks(req.userRole)
  }

  @Post('import')
  @Access('platform.admin')
  import(@Req() req: { userRole?: string }, @Body() body: unknown) {
    return this.compliance.import(req.userRole, body)
  }
}
