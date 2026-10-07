import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { LearnGuard } from '../../auth/learn.guard'
import type { LearnToolList } from '../../learn/learn-types'
import { connectionView, toolView } from './tool-config'
import { ToolRegistryService, type Registry } from './tool-registry.service'

interface LearnRequest {
  userId: string
  userRole?: string
}

/** The registry as an administrator sees it: every connection and tool, with their settings. */
const view = (r: Registry): LearnToolList => ({
  tools: r.tools.map((t) => toolView(t, true)),
  connections: r.connections.map((c) => connectionView(c, r.tools)),
  canManage: true,
})

/**
 * Connections and tools: a system administrator manages them (every call checks the role). Authors
 * pick from the tools their course may use through `GET /learn/courses/:id/tools` instead.
 */
@Controller('learn/tools')
@UseGuards(LearnGuard)
export class ToolRegistryController {
  constructor(private readonly registry: ToolRegistryService) {}

  @Get()
  async list(@Req() req: LearnRequest) {
    this.registry.assertManage(req.userRole)
    return view(await this.registry.list())
  }

  /** Who changed what, newest first. `?subjectId=` limits it to one tool or connection. */
  @Get('history')
  history(@Req() req: LearnRequest, @Query('subjectId') subjectId?: string) {
    return this.registry.history(req.userRole, subjectId || undefined)
  }

  // Connection routes come before `:id` so "connections" is never read as a tool id.

  @Post('connections')
  async createConnection(@Req() req: LearnRequest, @Body() body: unknown) {
    return view(await this.registry.createConnection(req.userRole, req.userId, body))
  }

  @Put('connections/:id')
  async updateConnection(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return view(await this.registry.updateConnection(req.userRole, req.userId, id, body))
  }

  @Delete('connections/:id')
  async removeConnection(@Req() req: LearnRequest, @Param('id') id: string) {
    return view(await this.registry.removeConnection(req.userRole, req.userId, id))
  }

  @Post()
  async createTool(@Req() req: LearnRequest, @Body() body: unknown) {
    return view(await this.registry.createTool(req.userRole, req.userId, body))
  }

  @Put(':id')
  async updateTool(@Req() req: LearnRequest, @Param('id') id: string, @Body() body: unknown) {
    return view(await this.registry.updateTool(req.userRole, req.userId, id, body))
  }

  @Delete(':id')
  async removeTool(@Req() req: LearnRequest, @Param('id') id: string) {
    return view(await this.registry.removeTool(req.userRole, req.userId, id))
  }
}
