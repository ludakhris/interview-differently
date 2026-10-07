import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { LearnGuard } from '../../auth/learn.guard'
import { ActivityService } from './activity.service'

interface LearnRequest {
  userId: string
  userRole?: string
}

/** Time spent in online courses (#69 E). See docs/talent-and-attendance-design.md section 6E. */
@Controller('learn')
@UseGuards(LearnGuard)
export class ActivityController {
  constructor(private readonly service: ActivityService) {}

  /** The learner pages' heartbeat. Any signed-in learner; only their own enrollment is touched. */
  @Post('me/activity/heartbeat')
  @HttpCode(204)
  async heartbeat(@Req() req: LearnRequest, @Body() body: unknown): Promise<void> {
    await this.service.heartbeat(req.userId, body)
  }

  @Get('me/cohorts/:cohortId/activity')
  own(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    return this.service.ownReport(req.userId, cohortId, from, to)
  }

  @Get('cohorts/:cohortId/activity')
  cohort(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    return this.service.cohortReport(req.userId, req.userRole, cohortId, from, to)
  }

  @Get('cohorts/:cohortId/activity/learners/:userId')
  learner(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Param('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    return this.service.learnerReport(req.userId, req.userRole, cohortId, userId, from, to)
  }

  @Get('cohorts/:cohortId/activity.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="cohort-activity.csv"')
  csv(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    return this.service.cohortCsv(req.userId, req.userRole, cohortId, from, to)
  }
}
