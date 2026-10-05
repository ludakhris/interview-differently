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
import type { CourseOutline } from '@id/types'
import { LearnGuard } from '../auth/learn.guard'
import { CoursesService } from './courses.service'

interface LearnRequest {
  userId: string
  userRole?: string
}

/** Course setup for provider workspaces. Every call checks role and workspace access. */
@Controller('learn')
@UseGuards(LearnGuard)
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get('workspaces/:workspace/courses')
  list(@Req() req: LearnRequest, @Param('workspace') workspace: string) {
    return this.courses.list(req.userId, req.userRole, workspace)
  }

  @Post('workspaces/:workspace/courses')
  create(@Req() req: LearnRequest, @Param('workspace') workspace: string, @Body() body: unknown) {
    return this.courses.create(req.userId, req.userRole, workspace, body)
  }

  @Get('courses/:id')
  detail(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.courses.detail(req.userId, req.userRole, id)
  }

  @Put('courses/:id')
  update(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.courses.update(req.userId, req.userRole, id, body)
  }

  @Delete('courses/:id')
  @HttpCode(204)
  async remove(@Req() req: LearnRequest, @Param('id') id: string): Promise<void> {
    await this.courses.remove(req.userId, req.userRole, id)
  }

  @Put('courses/:id/outline')
  reorder(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: CourseOutline) {
    return this.courses.reorder(req.userId, req.userRole, id, body)
  }

  @Post('courses/:id/modules')
  addModule(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.courses.addModule(req.userId, req.userRole, id, body)
  }

  @Put('modules/:id')
  renameModule(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.courses.renameModule(req.userId, req.userRole, id, body)
  }

  @Delete('modules/:id')
  removeModule(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.courses.removeModule(req.userId, req.userRole, id)
  }

  @Post('modules/:id/items')
  addItem(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.courses.addItem(req.userId, req.userRole, id, body)
  }

  @Put('items/:id')
  updateItem(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.courses.updateItem(req.userId, req.userRole, id, body)
  }

  @Delete('items/:id')
  removeItem(@Req() req: LearnRequest, @Param('id') id: string) {
    return this.courses.removeItem(req.userId, req.userRole, id)
  }

  @Get('catalog/assessments')
  assessments(@Req() req: LearnRequest) {
    return this.courses.assessmentCatalog(req.userRole)
  }

  @Get('catalog/scenarios')
  scenarios(@Req() req: LearnRequest) {
    return this.courses.scenarioCatalog(req.userRole)
  }
}
