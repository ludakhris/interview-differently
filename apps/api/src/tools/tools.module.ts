import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { ToolsAdminController, ToolsMeController } from './tools.controller'
import { ToolsService } from './tools.service'

@Module({
  imports: [PrismaModule],
  controllers: [ToolsAdminController, ToolsMeController],
  providers: [ToolsService],
})
export class ToolsModule {}
