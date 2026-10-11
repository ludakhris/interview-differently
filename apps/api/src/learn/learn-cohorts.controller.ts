import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { LearnGuard } from '../auth/learn.guard'
import { Access } from './access/access.decorator'
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

  @Access('cohort.manage')
  @Get('workspaces/:workspace/runnable-courses')
  runnable(@Req() req: LearnRequest, @Param('workspace') workspace: string) {
    return this.cohorts.runnableCourses(req.userId, req.userRole, workspace)
  }

  @Access('cohort.read')
  @Get('workspaces/:workspace/cohorts')
  list(@Req() req: LearnRequest, @Param('workspace') workspace: string) {
    return this.cohorts.list(req.userId, req.userRole, workspace)
  }

  @Access('cohort.manage')
  @Post('workspaces/:workspace/cohorts')
  create(@Req() req: LearnRequest, @Param('workspace') workspace: string, @Body() body: unknown) {
    return this.cohorts.create(req.userId, req.userRole, workspace, body)
  }

  @Access('cohort.read')
  @Get('cohorts/:id')
  detail(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.detail(req.userId, req.userRole, id)
  }

  @Access('cohort.manage')
  @Put('cohorts/:id')
  update(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.cohorts.update(req.userId, req.userRole, id, body)
  }

  @Access('cohort.manage')
  @Post('cohorts/:id/learners')
  addLearner(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.cohorts.addLearner(req.userId, req.userRole, id, body)
  }

  @Access('cohort.read')
  @Get('cohorts/:id/join-requests')
  joinRequests(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.joinRequests(req.userId, req.userRole, id)
  }

  @Access('cohort.manage')
  @Post('join-requests/:id/approve')
  approveRequest(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.approveRequest(req.userId, req.userRole, id)
  }

  @Access('cohort.manage')
  @Post('join-requests/:id/decline')
  declineRequest(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.declineRequest(req.userId, req.userRole, id)
  }

  @Access('cohort.manage')
  @Post('enrollments/:id/recompute')
  recompute(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.recompute(req.userId, req.userRole, id)
  }

  /** The cohort's Assessments grid: each assessment of the course with its stats. */
  @Access('cohort.read')
  @Get('cohorts/:id/assessments')
  assessmentSummary(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.assessmentSummary(req.userId, req.userRole, id)
  }

  /** Every assessment of the cohort in one CSV. */
  @Access('cohort.read')
  @Get('cohorts/:id/assessments.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="assessments.csv"')
  assessmentsCsv(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.assessmentsCsv(req.userId, req.userRole, id)
  }

  /** Every learner's result on one assessment. */
  @Access('cohort.read')
  @Get('cohorts/:id/assessments/:itemId/results')
  assessmentResults(
    @Req() req: LearnRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string
  ) {
    return this.cohorts.assessmentResults(req.userId, req.userRole, id, itemId)
  }

  @Access('cohort.read')
  @Get('cohorts/:id/assessments/:itemId/results.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="assessment-results.csv"')
  assessmentResultsCsv(
    @Req() req: LearnRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string
  ) {
    return this.cohorts.assessmentResultsCsv(req.userId, req.userRole, id, itemId)
  }

  /** How far through each assessment the cohort's learners are, live. */
  @Access('cohort.read')
  @Get('cohorts/:id/monitor/assessments')
  assessmentMonitor(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.assessmentMonitor(req.userId, req.userRole, id)
  }

  /** The SQL the cohort's learners have run in the sandbox, live. */
  @Access('cohort.read')
  @Get('cohorts/:id/monitor/sql')
  sqlMonitor(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.sqlMonitor(req.userId, req.userRole, id)
  }

  /** Starts the LTI launch that opens one learner's submitted answers, read-only, for staff. */
  @Access('cohort.staff')
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

  @Access('cohort.staff')
  @Get('enrollments/:id/attempts')
  attempts(@Req() req: LearnRequest, @Param('id') id: string, @Query('itemId') itemId?: string) {
    return this.cohorts.attempts(req.userId, req.userRole, id, itemId)
  }

  @Access('cohort.manage')
  @Delete('enrollments/:id')
  withdraw(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.withdraw(req.userId, req.userRole, id)
  }

  @Access('course.manage')
  @Get('courses/:id/offers')
  offers(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.cohorts.offers(req.userId, req.userRole, id)
  }

  @Access('course.manage')
  @Post('courses/:id/offers')
  offer(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.cohorts.offer(req.userId, req.userRole, id, body)
  }

  @Access('course.manage')
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
