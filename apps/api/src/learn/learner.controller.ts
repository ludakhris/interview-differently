import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { LearnGuard } from '../auth/learn.guard'
import { LtiPlatformService } from '../lti/platform/lti-platform.service'
import { LearnerService } from './learner.service'

interface LearnRequest {
  userId: string
}

/** The signed-in learner's own cohorts and course work. Needs a LearnDifferently sign-in, no staff role. */
@Controller('learn/me')
@UseGuards(LearnGuard)
export class LearnerController {
  constructor(
    private readonly learner: LearnerService,
    private readonly lti: LtiPlatformService
  ) {}

  @Get('learning')
  learning(@Req() req: LearnRequest) {
    return this.learner.cards(req.userId)
  }

  @Get('join-requests')
  joinRequests(@Req() req: LearnRequest) {
    return this.learner.joinRequests(req.userId)
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

  @Post('cohorts/:cohortId/items/:itemId/video')
  video(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown
  ) {
    return this.learner.completeVideo(req.userId, cohortId, itemId, body)
  }

  @Post('cohorts/:cohortId/items/:itemId/external')
  external(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Param('itemId') itemId: string
  ) {
    return this.learner.completeExternal(req.userId, cohortId, itemId)
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

  @Post('cohorts/:cohortId/items/:itemId/tool-launch')
  toolLaunch(
    @Req() req: LearnRequest & { headers: Record<string, string | string[] | undefined> },
    @Param('cohortId') cohortId: string,
    @Param('itemId') itemId: string
  ) {
    // The host the learner launched from (a tenant host keeps its skin); the platform validates it.
    const header = (name: string): string | undefined => {
      const v = req.headers[name]
      return typeof v === 'string' ? v : undefined
    }
    const origin = header('origin') ?? originOf(header('referer'))
    return this.lti.startLaunch(req.userId, cohortId, itemId, origin)
  }
}

function originOf(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).origin : undefined
  } catch {
    return undefined
  }
}
