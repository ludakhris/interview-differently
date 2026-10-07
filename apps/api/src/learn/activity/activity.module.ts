import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { StorageModule } from '../../storage/storage.module'
import { LearnAccessModule } from '../learn-access.module'
import { ActivityController } from './activity.controller'
import { ActivityService } from './activity.service'

/** #69: see docs/talent-and-attendance-design.md for this feature's endpoints. */
@Module({
  imports: [PrismaModule, StorageModule, LearnAccessModule],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
