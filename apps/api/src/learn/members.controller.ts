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
import { LearnGuard } from '../auth/learn.guard'
import { Access } from './access/access.decorator'
import { MembersService } from './members.service'

interface LearnRequest {
  userId: string
  userRole?: string
}

/** Who works in a workspace and in what role (GitHub issue #84). */
@Controller('learn/workspaces/:workspace/members')
@UseGuards(LearnGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  private actor = (req: LearnRequest) => ({ userId: req.userId, role: req.userRole })

  @Get()
  @Access('members.manage')
  list(@Req() req: LearnRequest, @Param('workspace') workspace: string) {
    return this.members.list(this.actor(req), workspace)
  }

  @Post()
  @Access('members.manage')
  grant(
    @Req() req: LearnRequest,
    @Param('workspace') workspace: string,
    @Body() body: { email?: unknown; role?: unknown; cohortId?: unknown }
  ) {
    return this.members.grant(this.actor(req), workspace, body)
  }

  @Delete(':membershipId')
  @HttpCode(204)
  @Access('members.manage')
  async revoke(
    @Req() req: LearnRequest,
    @Param('workspace') workspace: string,
    @Param('membershipId') membershipId: string
  ) {
    await this.members.revoke(this.actor(req), workspace, membershipId)
  }

  @Delete('invites/:inviteId')
  @HttpCode(204)
  @Access('members.manage')
  async revokeInvite(
    @Req() req: LearnRequest,
    @Param('workspace') workspace: string,
    @Param('inviteId') inviteId: string
  ) {
    await this.members.revokeInvite(this.actor(req), workspace, inviteId)
  }
}
