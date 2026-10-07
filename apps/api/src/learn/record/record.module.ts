import { Module, forwardRef } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { ActivityModule } from '../activity/activity.module'
import { AttendanceModule } from '../attendance/attendance.module'
import { LearnAccessModule } from '../learn-access.module'
import { TalentModule } from '../talent/talent.module'
import { RecordController } from './record.controller'
import { RecordService } from './record.service'

/** One learner in one cohort, composed from attendance, activity and notes. */
@Module({
  imports: [
    PrismaModule,
    LearnAccessModule,
    AttendanceModule,
    ActivityModule,
    forwardRef(() => TalentModule),
  ],
  controllers: [RecordController],
  providers: [RecordService],
})
export class RecordModule {}
