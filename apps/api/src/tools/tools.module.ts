import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import {
  SandboxActivityController,
  ToolsAdminController,
  ToolsMeController,
} from './tools.controller'
import { ToolsService } from './tools.service'

@Module({
  imports: [PrismaModule],
  controllers: [SandboxActivityController, ToolsAdminController, ToolsMeController],
  providers: [ToolsService],
})
export class ToolsModule {}
