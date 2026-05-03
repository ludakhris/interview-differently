import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Ip,
  Headers,
  Post,
} from '@nestjs/common'
import { ScenarioRequestsService, type ScenarioRequestInput } from './scenario-requests.service'
import { IpRateLimiter } from './rate-limit'

// 5 submissions per IP per hour. Anyone needs more than that is either a bot
// or having a very productive brainstorming session — both deserve a pause.
const RATE_LIMITER = new IpRateLimiter(5, 60 * 60 * 1000)

@Controller('scenario-requests')
export class ScenarioRequestsController {
  constructor(private readonly service: ScenarioRequestsService) {}

  @Post()
  @HttpCode(202) // Accepted — DB row is written synchronously, email fires async
  async submit(
    @Body() body: ScenarioRequestInput,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    if (!RATE_LIMITER.allow(ip)) {
      throw new HttpException('Too many requests — please try again later', HttpStatus.TOO_MANY_REQUESTS)
    }
    return this.service.submit(body, ip, userAgent)
  }
}
