import { Module, forwardRef } from '@nestjs/common'
import { LtiPlatformModule } from '../lti/platform/lti-platform.module'
import { PrismaModule } from '../prisma/prisma.module'
import { StorageModule } from '../storage/storage.module'
import { AdminUsersController } from './admin-users.controller'
import { AdminUsersService } from './admin-users.service'
import { CoursesController } from './courses.controller'
import { CoursesService } from './courses.service'
import { ActivityModule } from './activity/activity.module'
import { AttendanceModule } from './attendance/attendance.module'
import { InterviewScoringService } from './interview-scoring.service'
import { ItemImageController } from './item-image.controller'
import { ItemImageService } from './item-image.service'
import { LearnAccessModule } from './learn-access.module'
import { LearnCohortsController } from './learn-cohorts.controller'
import { LearnCohortsService } from './learn-cohorts.service'
import { LearnController } from './learn.controller'
import { LearnerController } from './learner.controller'
import { LearnerService } from './learner.service'
import { OutcomesModule } from './outcomes/outcomes.module'
import { PublicCatalogController } from './public-catalog.controller'
import { PublicCatalogService } from './public-catalog.service'
import { TalentModule } from './talent/talent.module'
import { ScormController, ScormFilesController } from './scorm.controller'
import { ScormService } from './scorm.service'

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    forwardRef(() => LtiPlatformModule),
    LearnAccessModule,
    OutcomesModule,
    forwardRef(() => TalentModule),
    AttendanceModule,
    ActivityModule,
  ],
  controllers: [
    LearnController,
    CoursesController,
    LearnCohortsController,
    LearnerController,
    ScormController,
    ScormFilesController,
    ItemImageController,
    PublicCatalogController,
    AdminUsersController,
  ],
  exports: [LearnerService],
  providers: [
    CoursesService,
    LearnCohortsService,
    LearnerService,
    ScormService,
    ItemImageService,
    PublicCatalogService,
    InterviewScoringService,
    AdminUsersService,
  ],
})
export class LearnModule {}
