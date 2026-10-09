import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { LearnGuard } from '../auth/learn.guard'
import { LtiPlatformService } from '../lti/platform/lti-platform.service'
import { LearnCohortsService } from './learn-cohorts.service'

interface LearnRequest {
  userId: string
  userRole?: string
  headers?: Record<string, string | string[] | undefined>
}

/** Cohorts, rosters and course offers for provider and organization workspaces. */
@Controller('learn')
@UseGuards(LearnGuard)
export class LearnCohortsController {
  constructor(
    private readonly cohorts: LearnCohortsService,
    private readonly lti: LtiPlatformService
  ) {}

  @Get('workspaces/:workspace/runnable-courses')
  runnable(@Req() req: LearnRequest, @Param('workspace') workspace: string) {
    return this.cohorts.runnableCourses(req.userId, req.userRole, workspace)
  }

  @Get('workspaces/:workspace/cohorts')
  list(@Req() req: LearnRequest, @Param('workspace') workspace: string) {
    return this.cohorts.list(req.userId, req.userRole, workspace)
  }

  @Post('workspaces/:workspace/cohorts')
  create(@Req() req: LearnRequest, @Param('workspace') workspace: string, @Body() body: unknown) {
    return this.cohorts.create(req.userId, req.userRole, workspace, body)
  }

  @Get('cohorts/:id')
  detail(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.detail(req.userId, req.userRole, id)
  }

  @Put('cohorts/:id')
  update(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.cohorts.update(req.userId, req.userRole, id, body)
  }

  @Post('cohorts/:id/learners')
  addLearner(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.cohorts.addLearner(req.userId, req.userRole, id, body)
  }

  @Get('cohorts/:id/join-requests')
  joinRequests(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.joinRequests(req.userId, req.userRole, id)
  }

  @Post('join-requests/:id/approve')
  approveRequest(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.approveRequest(req.userId, req.userRole, id)
  }

  @Post('join-requests/:id/decline')
  declineRequest(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.declineRequest(req.userId, req.userRole, id)
  }

  @Post('enrollments/:id/recompute')
  recompute(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.recompute(req.userId, req.userRole, id)
  }

  /** Who has started, is partway or has submitted each assessment of the cohort's course. */
  @Get('cohorts/:id/assessment-status')
  assessmentStatus(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.assessmentStatus(req.userId, req.userRole, id)
  }

  /** Starts the LTI launch that opens one learner's submitted answers, read-only, for staff. */
  @Post('enrollments/:id/review-launch')
  async reviewLaunch(
    @Req() req: LearnRequest,
    @Param('id') id: string,
    @Body() body: { itemId?: string }
  ) {
    const t = await this.cohorts.reviewTarget(req.userId, req.userRole, id, body?.itemId)
    // The host the staff member launched from keeps its skin; the platform validates it.
    const header = (name: string): string | undefined => {
      const v = req.headers?.[name]
      return typeof v === 'string' ? v : undefined
    }
    return this.lti.startStaffReview(
      req.userId,
      t.cohortId,
      t.itemId,
      t.learnerUserId,
      header('origin') ?? originOf(header('referer'))
    )
  }

  @Get('enrollments/:id/attempts')
  attempts(@Req() req: LearnRequest, @Param('id') id: string, @Query('itemId') itemId?: string) {
    return this.cohorts.attempts(req.userId, req.userRole, id, itemId)
  }

  @Delete('enrollments/:id')
  withdraw(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.withdraw(req.userId, req.userRole, id)
  }

  @Get('courses/:id/offers')
  offers(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.offers(req.userId, req.userRole, id)
  }

  @Post('courses/:id/offers')
  offer(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.cohorts.offer(req.userId, req.userRole, id, body)
  }

  @Delete('courses/:id/offers/:workspace')
  unoffer(
    @Req() req: LearnRequest,
    @Param('id') id: string,
    @Param('workspace') workspace: string
  ) {
    return this.cohorts.unoffer(req.userId, req.userRole, id, workspace)
  }
}

function originOf(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).origin : undefined
  } catch {
    return undefined
  }
}
