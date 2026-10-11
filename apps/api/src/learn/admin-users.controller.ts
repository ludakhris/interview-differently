import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common'
import { LearnGuard } from '../auth/learn.guard'
import { Access } from './access/access.decorator'
import { AdminUsersService } from './admin-users.service'

interface LearnRequest {
  userId: string
  userRole?: string
}

/** System admin toolbox: platform administrators. Roles at a workspace are in members.controller.ts. */
@Controller('learn/admin')
@UseGuards(LearnGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get('roles')
  @Access('platform.admin')
  roles(@Req() req: LearnRequest) {
    return this.users.roles(req.userRole)
  }

  @Get('users')
  @Access('platform.admin')
  search(@Req() req: LearnRequest, @Query('q') q?: string) {
    return this.users.search(req.userRole, q)
  }

  @Put('users/:id/role')
  @Access('platform.admin')
  setRole(
    @Req() req: LearnRequest,
    @Param('id') id: string,
    @Body() body: { role?: string | null }
  ) {
    return this.users.setRole(req.userId, req.userRole, id, body?.role ?? null)
  }
}
