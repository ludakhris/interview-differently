import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common'
import { LearnGuard } from '../../auth/learn.guard'
import { RecordService } from './record.service'

interface LearnRequest {
  userId: string
  userRole?: string
}

/** Staff view of one learner in a cohort. See docs/talent-and-attendance-design.md. */
@Controller('learn')
@UseGuards(LearnGuard)
export class RecordController {
  constructor(private readonly service: RecordService) {}

  @Get('cohorts/:cohortId/learners/:userId/record')
  record(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Param('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tz') tz?: string
  ) {
    return this.service.record(req.userId, req.userRole, cohortId, userId, { from, to, tz })
  }
}
