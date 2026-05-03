import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { ScenarioRequestsController } from './scenario-requests.controller'
import { ScenarioRequestsService } from './scenario-requests.service'

@Module({
  imports: [PrismaModule],
  controllers: [ScenarioRequestsController],
  providers: [ScenarioRequestsService],
})
export class ScenarioRequestsModule {}
