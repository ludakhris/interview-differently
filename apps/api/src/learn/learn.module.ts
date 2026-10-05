import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { StorageModule } from '../storage/storage.module'
import { CoursesController } from './courses.controller'
import { CoursesService } from './courses.service'
import { LearnCohortsController } from './learn-cohorts.controller'
import { LearnCohortsService } from './learn-cohorts.service'
import { LearnController } from './learn.controller'
import { LearnerController } from './learner.controller'
import { LearnerService } from './learner.service'
import { LearnService } from './learn.service'
import { ScormController, ScormFilesController } from './scorm.controller'
import { ScormService } from './scorm.service'

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [
    LearnController,
    CoursesController,
    LearnCohortsController,
    LearnerController,
    ScormController,
    ScormFilesController,
  ],
  providers: [LearnService, CoursesService, LearnCohortsService, LearnerService, ScormService],
})
export class LearnModule {}
