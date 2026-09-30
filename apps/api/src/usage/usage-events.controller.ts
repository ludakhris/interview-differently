import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { UsageEventsService } from './usage-events.service'

/** Page-view ingest (#42 Phase 2). Any signed-in user, attributed to their own token. */
@Controller('me/usage-events')
@UseGuards(AuthenticatedGuard)
export class UsageEventsController {
  constructor(private readonly service: UsageEventsService) {}

  @Post()
  @HttpCode(204)
  async record(@Req() req: { userId: string }, @Body() body: { path?: unknown }): Promise<void> {
    await this.service.recordPageView(req.userId, body?.path)
  }
}
