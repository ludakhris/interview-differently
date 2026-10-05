import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { CoursesController } from './courses.controller'
import { CoursesService } from './courses.service'
import { LearnCohortsController } from './learn-cohorts.controller'
import { LearnCohortsService } from './learn-cohorts.service'
import { LearnController } from './learn.controller'
import { LearnService } from './learn.service'

@Module({
  imports: [PrismaModule],
  controllers: [LearnController, CoursesController, LearnCohortsController],
  providers: [LearnService, CoursesService, LearnCohortsService],
})
export class LearnModule {}
