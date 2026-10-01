import { Body, Controller, HttpCode, Ip, Headers, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { ScenarioRequestsService, type ScenarioRequestInput } from './scenario-requests.service'

@Controller('scenario-requests')
export class ScenarioRequestsController {
  constructor(private readonly service: ScenarioRequestsService) {}

  // 5 submissions per IP per hour. Anyone needs more than that is either a bot
  // or having a very productive brainstorming session — both deserve a pause.
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @HttpCode(202) // Accepted — DB row is written synchronously, email fires async
  async submit(
    @Body() body: ScenarioRequestInput,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string
  ) {
    return this.service.submit(body, ip, userAgent)
  }
}
