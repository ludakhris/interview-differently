import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { CourseOutline } from './learn-types'
import { LearnGuard } from '../auth/learn.guard'
import { CoursesService } from './courses.service'
import { Access } from './access/access.decorator'

interface LearnRequest {
  userId: string
  userRole?: string
}

/** Course setup for provider workspaces. Every call checks role and workspace access. */
@Controller('learn')
@UseGuards(LearnGuard)
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Access('course.manage')
  @Get('workspaces/:workspace/courses')
  list(@Req() req: LearnRequest, @Param('workspace') workspace: string) {
    return this.courses.list(req.userId, req.userRole, workspace)
  }

  @Access('course.manage')
  @Post('workspaces/:workspace/courses')
  create(@Req() req: LearnRequest, @Param('workspace') workspace: string, @Body() body: unknown) {
    return this.courses.create(req.userId, req.userRole, workspace, body)
  }

  @Access('course.manage')
  @Get('courses/:id/tools')
  tools(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.courses.toolsFor(req.userId, req.userRole, id)
  }

  @Access('course.manage')
  @Get('courses/:id')
  detail(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.courses.detail(req.userId, req.userRole, id)
  }

  @Access('course.manage')
  @Put('courses/:id')
  update(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.courses.update(req.userId, req.userRole, id, body)
  }

  @Access('course.manage')
  @Delete('courses/:id')
  @HttpCode(204)
  async remove(@Req() req: LearnRequest, @Param('id') id: string): Promise<void> {
    await this.courses.remove(req.userId, req.userRole, id)
  }

  @Access('course.manage')
  @Put('courses/:id/outline')
  reorder(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: CourseOutline) {
    return this.courses.reorder(req.userId, req.userRole, id, body)
  }

  @Access('course.manage')
  @Post('courses/:id/modules')
  addModule(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.courses.addModule(req.userId, req.userRole, id, body)
  }

  @Access('course.manage')
  @Put('modules/:id')
  renameModule(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.courses.renameModule(req.userId, req.userRole, id, body)
  }

  @Access('course.manage')
  @Delete('modules/:id')
  removeModule(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.courses.removeModule(req.userId, req.userRole, id)
  }

  @Access('course.manage')
  @Post('modules/:id/items')
  addItem(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.courses.addItem(req.userId, req.userRole, id, body)
  }

  @Access('course.manage')
  @Put('items/:id')
  updateItem(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.courses.updateItem(req.userId, req.userRole, id, body)
  }

  @Access('course.manage')
  @Delete('items/:id')
  removeItem(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.courses.removeItem(req.userId, req.userRole, id)
  }

  @Access('course.manage')
  @Get('catalog/assessments')
  assessments(@Req() req: LearnRequest) {
    return this.courses.assessmentCatalog(req.userId, req.userRole)
  }

  @Access('course.manage')
  @Get('catalog/scenarios')
  scenarios(@Req() req: LearnRequest) {
    return this.courses.scenarioCatalog(req.userId, req.userRole)
  }
}
