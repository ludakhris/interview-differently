import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import { LearnGuard } from '../auth/learn.guard'
import { AttentionService } from './attention.service'

interface LearnRequest {
  userId: string
  userRole?: string
}

/** What waits for the signed-in person (#74). Any LearnDifferently sign-in; the service returns only what their role may act on. */
@Controller('learn/me')
@UseGuards(LearnGuard)
export class AttentionController {
  constructor(private readonly attention: AttentionService) {}

  @Get('attention')
  mine(@Req() req: LearnRequest) {
    return this.attention.forUser(req.userId, req.userRole)
  }
}
