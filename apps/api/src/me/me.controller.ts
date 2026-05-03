import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common'
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

  /**
   * Returns the Institution that matches the caller's Clerk email domain,
   * or null. Used by the /welcome page to suggest an institution to join.
   */
  @Get('institution-suggestion')
  suggestion(@Req() req: AuthedRequest) {
    return this.service.getInstitutionSuggestion(req.userId)
  }

  @Get('memberships')
  myMemberships(@Req() req: AuthedRequest) {
    return this.service.listMemberships(req.userId)
  }

  @Post('memberships')
  join(@Req() req: AuthedRequest, @Body() body: { joinKey?: string; institutionId?: string }) {
    return this.service.join(req.userId, body)
  }

  @Delete('memberships/:membershipId')
  @HttpCode(204)
  async leave(@Req() req: AuthedRequest, @Param('membershipId') membershipId: string): Promise<void> {
    await this.service.leave(req.userId, membershipId)
  }
}
