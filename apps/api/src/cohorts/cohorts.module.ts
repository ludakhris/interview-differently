import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { CohortsController } from './cohorts.controller'
import { CohortsService } from './cohorts.service'

@Module({
  imports: [PrismaModule],
  controllers: [CohortsController],
  providers: [CohortsService],
})
export class CohortsModule {}
