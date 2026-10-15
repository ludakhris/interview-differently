import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { LearnGuard } from '../auth/learn.guard'
import { Access } from './access/access.decorator'
import { AdminContentService } from './admin-content.service'

interface LearnRequest {
  userId: string
  userRole?: string
}

/** System admin toolbox: Content review, approving AI-written practice and lessons for reuse (GitHub issue #90). */
@Controller('learn/admin/content')
@UseGuards(LearnGuard)
export class AdminContentController {
  constructor(private readonly content: AdminContentService) {}

  @Get()
  @Access('platform.admin')
  library(@Req() req: LearnRequest, @Query('filter') filter?: string) {
    return this.content.library(req.userRole, filter)
  }

  /** A link to watch a lesson in Spark's player before deciding; it records nothing. */
  @Get('lesson/:id/preview')
  @Access('platform.admin')
  preview(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.content.previewLesson(req.userId, req.userRole, id)
  }

  @Post(':kind/:id/curate')
  @Access('platform.admin')
  curate(
    @Req() req: LearnRequest,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: { approve?: unknown }
  ) {
    return this.content.curate(req.userId, req.userRole, kind, id, body?.approve)
  }
}
