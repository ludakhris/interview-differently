import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common'
import { LearnGuard } from '../auth/learn.guard'
import { DataAccessLogService } from './data-access-log.service'

interface LearnRequest {
  userId: string
  userRole?: string
}

/** Who looked at staff-only participant data. System admins (any provider) and provider staff (their own). */
@Controller('learn')
@UseGuards(LearnGuard)
export class DataAccessLogController {
  constructor(private readonly log: DataAccessLogService) {}

  @Get('data-access-log')
  list(
    @Req() req: LearnRequest,
    @Query('providerId') providerId?: string,
    @Query('subjectUserId') subjectUserId?: string,
    @Query('actorId') actorId?: string,
    @Query('resource') resource?: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string
  ) {
    return this.log.list(req.userId, req.userRole, {
      providerId,
      subjectUserId,
      actorId,
      resource,
      limit: limit ? Number(limit) : undefined,
      before,
    })
  }
}
