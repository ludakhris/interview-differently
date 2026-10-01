import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { IsString, MaxLength } from 'class-validator'
import { AuthenticatedGuard } from '../auth/authenticated.guard'
import type { AuthedRequest } from '../auth/owner'
import { ConsentService } from './consent.service'

class AcceptConsentDto {
  @IsString()
  @MaxLength(30)
  kind!: string

  @IsString()
  @MaxLength(30)
  version!: string
}

@Controller('me/consents')
@UseGuards(AuthenticatedGuard)
export class ConsentController {
  constructor(private readonly service: ConsentService) {}

  @Get()
  status(@Req() req: AuthedRequest) {
    return this.service.status(req.userId)
  }

  @Post()
  accept(@Req() req: AuthedRequest, @Body() dto: AcceptConsentDto) {
    return this.service.accept(req.userId, dto.kind, dto.version)
  }
}
