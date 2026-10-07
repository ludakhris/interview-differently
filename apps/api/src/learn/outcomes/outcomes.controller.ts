import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import { LearnGuard } from '../../auth/learn.guard'
import { OutcomesService } from './outcomes.service'

interface LearnRequest {
  userId: string
}

/** #69 A: the signed-in learner's own outcomes. Needs a LearnDifferently sign-in, no staff role. */
@Controller('learn')
@UseGuards(LearnGuard)
export class OutcomesController {
  constructor(private readonly service: OutcomesService) {}

  @Get('me/outcomes')
  mine(@Req() req: LearnRequest) {
    return this.service.mine(req.userId)
  }
}
