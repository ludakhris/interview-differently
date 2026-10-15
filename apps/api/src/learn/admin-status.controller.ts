import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import { LearnGuard } from '../auth/learn.guard'
import { Access } from './access/access.decorator'
import { AdminStatusService } from './admin-status.service'

/** System admin toolbox: System status, how each product is doing (GitHub issue #92). */
@Controller('learn/admin/status')
@UseGuards(LearnGuard)
export class AdminStatusController {
  constructor(private readonly statusService: AdminStatusService) {}

  @Get()
  @Access('platform.admin')
  status(@Req() req: { userRole?: string }) {
    return this.statusService.status(req.userRole)
  }
}
