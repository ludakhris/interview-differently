import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { LearnGuard } from '../auth/learn.guard'
import { LearnerService } from './learner.service'

interface LearnRequest {
  userId: string
}

/** The signed-in learner's own cohorts and course work. Needs a LearnDifferently sign-in, no staff role. */
@Controller('learn/me')
@UseGuards(LearnGuard)
export class LearnerController {
  constructor(private readonly learner: LearnerService) {}

  @Get('learning')
  learning(@Req() req: LearnRequest) {
    return this.learner.cards(req.userId)
  }

  @Post('join')
  join(@Req() req: LearnRequest, @Body() body: { code?: unknown }) {
    return this.learner.join(req.userId, body?.code)
  }

  @Get('cohorts/:cohortId')
  outline(@Req() req: LearnRequest, @Param('cohortId') cohortId: string) {
    return this.learner.outline(req.userId, cohortId)
  }

  @Get('cohorts/:cohortId/items/:itemId')
  item(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Param('itemId') itemId: string
  ) {
    return this.learner.item(req.userId, cohortId, itemId)
  }

  @Post('cohorts/:cohortId/items/:itemId/complete')
  complete(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Param('itemId') itemId: string
  ) {
    return this.learner.completeLesson(req.userId, cohortId, itemId)
  }

  @Post('cohorts/:cohortId/items/:itemId/scorm')
  scorm(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown
  ) {
    return this.learner.saveScorm(req.userId, cohortId, itemId, body)
  }

  @Post('cohorts/:cohortId/items/:itemId/interview')
  interview(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Param('itemId') itemId: string,
    @Body() body: { answers?: unknown }
  ) {
    return this.learner.submitInterview(req.userId, cohortId, itemId, body?.answers)
  }

  @Post('cohorts/:cohortId/items/:itemId/answers')
  answers(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Param('itemId') itemId: string,
    @Body() body: { answers?: unknown }
  ) {
    return this.learner.submitQuiz(req.userId, cohortId, itemId, body?.answers)
  }
}
