import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { IsOptional, IsString, MaxLength } from 'class-validator'
import { MeService } from './me.service'
import { UserQuota } from '../common/user-quota'

class JoinDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  joinKey?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  institutionId?: string
}

// Join keys are admin-chosen and can be short — slow down guessing.
const JOINS = new UserQuota(10, 10 * 60 * 1000, 'Too many join attempts')

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
  join(@Req() req: AuthedRequest, @Body() body: JoinDto) {
    JOINS.assert(req.userId)
    return this.service.join(req.userId, body)
  }

  @Delete('memberships/:membershipId')
  @HttpCode(204)
  async leave(
    @Req() req: AuthedRequest,
    @Param('membershipId') membershipId: string
  ): Promise<void> {
    await this.service.leave(req.userId, membershipId)
  }
}
