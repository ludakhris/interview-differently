import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common'
import { LearnGuard } from '../../auth/learn.guard'
import { Access, SelfOnly } from '../access/access.decorator'
import { AdaptiveService } from './adaptive.service'

interface LearnRequest {
  userId: string
  userRole?: string
}

type Body = Record<string, unknown>

/**
 * Adaptive checkpoints (GitHub issue #90): the signed-in learner's side. The checkpoint itself runs in the Simulator's
 * page and the lesson in Spark's player; here the course page asks the intake question, and syncs after the embedded
 * page says something happened.
 */
@Controller('learn/me/cohorts/:cohortId/items/:itemId/adaptive')
@UseGuards(LearnGuard)
export class AdaptiveLearnerController {
  constructor(private readonly adaptive: AdaptiveService) {}

  @Get()
  @SelfOnly()
  state(@Req() req: LearnRequest, @Param('cohortId') c: string, @Param('itemId') i: string) {
    return this.adaptive.checkpointState(req.userId, c, i)
  }

  @Post('intake')
  @SelfOnly()
  intake(
    @Req() req: LearnRequest,
    @Param('cohortId') c: string,
    @Param('itemId') i: string,
    @Body() b: Body
  ) {
    return this.adaptive.intake(req.userId, c, i, b ?? {})
  }

  @Post('sync')
  @SelfOnly()
  sync(
    @Req() req: LearnRequest,
    @Param('cohortId') c: string,
    @Param('itemId') i: string,
    @Body() b: Body
  ) {
    return this.adaptive.sync(req.userId, c, i, b?.since)
  }

  @Get('lesson')
  @SelfOnly()
  lesson(@Req() req: LearnRequest, @Param('cohortId') c: string, @Param('itemId') i: string) {
    return this.adaptive.lessonSlot(req.userId, c, i)
  }

  @Post('lesson')
  @SelfOnly()
  makeLesson(@Req() req: LearnRequest, @Param('cohortId') c: string, @Param('itemId') i: string) {
    return this.adaptive.makeLesson(req.userId, c, i)
  }

  @Post('lesson/sync')
  @SelfOnly()
  lessonSync(@Req() req: LearnRequest, @Param('cohortId') c: string, @Param('itemId') i: string) {
    return this.adaptive.lessonSync(req.userId, c, i)
  }
}

/** Adaptive checkpoints (GitHub issue #90): the cohort's board for staff. */
@Controller('learn/cohorts/:id/adaptive')
@UseGuards(LearnGuard)
export class AdaptiveStaffController {
  constructor(private readonly adaptive: AdaptiveService) {}

  private actor(req: LearnRequest) {
    return { userId: req.userId, role: req.userRole }
  }

  @Access('cohort.read')
  @Get()
  board(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.adaptive.board(this.actor(req), id)
  }

  @Access('cohort.read')
  @Get('learners/:enrollmentId/seen')
  seen(@Req() req: LearnRequest, @Param('id') id: string, @Param('enrollmentId') e: string) {
    return this.adaptive.seen(this.actor(req), id, e)
  }

  @Access('cohort.staff')
  @Post('content/:contentId/review')
  review(
    @Req() req: LearnRequest,
    @Param('id') id: string,
    @Param('contentId') p: string,
    @Body() b: Body
  ) {
    return this.adaptive.review(this.actor(req), id, p, b?.approve)
  }

  /** A link to watch a lesson made for this cohort's learners before reviewing it; it records nothing. */
  @Access('cohort.staff')
  @Get('content/:contentId/preview')
  preview(@Req() req: LearnRequest, @Param('id') id: string, @Param('contentId') l: string) {
    return this.adaptive.previewLesson(this.actor(req), id, l)
  }

  @Access('course.manage')
  @Put('settings')
  settings(@Req() req: LearnRequest, @Param('id') id: string, @Body() b: Body) {
    return this.adaptive.settings(this.actor(req), id, b ?? {})
  }

  @Access('cohort.manage')
  @Post('demo/reset')
  demoReset(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.adaptive.demoReset(this.actor(req), id)
  }

  @Access('cohort.manage')
  @Post('demo/:persona/step')
  demoStep(@Req() req: LearnRequest, @Param('id') id: string, @Param('persona') persona: string) {
    return this.adaptive.demoStep(this.actor(req), id, persona)
  }
}
