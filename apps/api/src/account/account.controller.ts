import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Req,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { IsString } from 'class-validator'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import { ClerkService } from '../auth/clerk.service'
import type { AuthedRequest } from '../auth/owner'
import { AccountService } from './account.service'

class DeleteAccountDto {
  @IsString()
  confirm!: string
}

/** Self-service data export and account erasure (GDPR/CCPA rights). */
@Controller('me')
@UseGuards(AuthenticatedGuard)
export class AccountController {
  constructor(
    private readonly service: AccountService,
    private readonly clerk: ClerkService
  ) {}

  @Get('export')
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  export(@Req() req: AuthedRequest) {
    return this.service.exportUserData(req.userId)
  }

  @Delete('account')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  async deleteAccount(@Req() req: AuthedRequest, @Body() dto: DeleteAccountDto): Promise<void> {
    if (dto.confirm !== 'DELETE') throw new BadRequestException('Type DELETE to confirm')
    // A platform admin deleting themselves from a stray click could orphan the platform.
    if (await this.clerk.isAdmin(req.userId)) {
      throw new ForbiddenException('Admin accounts must be removed by another admin')
    }
    await this.service.eraseUserData(req.userId)
    await this.clerk.deleteUser(req.userId)
  }
}
