import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { AuthenticatedGuard } from '../../auth/authenticated.guard'
import { StandaloneCheckpointService } from './standalone-checkpoint.service'

interface AuthedRequest {
  userId: string
}

/**
 * The chat simulation in standalone Interview Differently (GitHub issue #90): a signed-in (Clerk) learner only. An
 * LTI session reaches the same chat through `lti/tool/checkpoint`, never here.
 */
@Controller('me/checkpoints')
@UseGuards(AuthenticatedGuard)
export class StandaloneCheckpointController {
  constructor(private readonly service: StandaloneCheckpointService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.service.list(req.userId)
  }

  @Post()
  start(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.service.start(req.userId, body)
  }

  @Get(':deliveryId')
  view(@Req() req: AuthedRequest, @Param('deliveryId') deliveryId: string) {
    return this.service.view(req.userId, deliveryId)
  }

  @Post(':deliveryId/run')
  run(@Req() req: AuthedRequest, @Param('deliveryId') deliveryId: string, @Body() body: unknown) {
    return this.service.run(req.userId, deliveryId, body)
  }

  @Post(':deliveryId/answer')
  answer(
    @Req() req: AuthedRequest,
    @Param('deliveryId') deliveryId: string,
    @Body() body: unknown
  ) {
    return this.service.answer(req.userId, deliveryId, body)
  }

  @Post(':deliveryId/help')
  help(@Req() req: AuthedRequest, @Param('deliveryId') deliveryId: string, @Body() body: unknown) {
    return this.service.help(req.userId, deliveryId, body)
  }
}
