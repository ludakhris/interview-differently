import { Controller, Post, Req, UseGuards } from '@nestjs/common'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { MeService } from './me.service'

interface AuthedRequest {
  userId: string
}

@Controller('me')
@UseGuards(AuthenticatedGuard)
export class MeController {
  constructor(private readonly service: MeService) {}

  /**
   * Refreshes the User mirror row for the calling user. Frontend calls
   * this once on sign-in so admins can later add the user to a cohort
   * by email without an upfront Clerk lookup.
   */
  @Post('sync')
  sync(@Req() req: AuthedRequest) {
    return this.service.sync(req.userId)
  }
}
