import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { UsageController } from './usage.controller'
import { UsageEventsController } from './usage-events.controller'
import { UsageEventsService } from './usage-events.service'
import { UsageService } from './usage.service'

@Module({
  imports: [PrismaModule],
  controllers: [UsageController, UsageEventsController],
  providers: [UsageService, UsageEventsService],
})
export class UsageModule {}
