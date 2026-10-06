import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { StorageModule } from '../storage/storage.module'
import { CoursesController } from './courses.controller'
import { CoursesService } from './courses.service'
import { InterviewScoringService } from './interview-scoring.service'
import { ItemImageController } from './item-image.controller'
import { ItemImageService } from './item-image.service'
import { LearnCohortsController } from './learn-cohorts.controller'
import { LearnCohortsService } from './learn-cohorts.service'
import { LearnController } from './learn.controller'
import { LearnerController } from './learner.controller'
import { LearnerService } from './learner.service'
import { LearnService } from './learn.service'
import { PublicCatalogController } from './public-catalog.controller'
import { PublicCatalogService } from './public-catalog.service'
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
    ItemImageController,
    PublicCatalogController,
  ],
  providers: [
    LearnService,
    CoursesService,
    LearnCohortsService,
    LearnerService,
    ScormService,
    ItemImageService,
    PublicCatalogService,
    InterviewScoringService,
  ],
})
export class LearnModule {}
