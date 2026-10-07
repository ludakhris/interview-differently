import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { StorageModule } from '../../storage/storage.module'
import { LearnAccessModule } from '../learn-access.module'
import { AttendanceController } from './attendance.controller'
import { AttendanceService } from './attendance.service'

/** #69: see docs/talent-and-attendance-design.md for this feature's endpoints. */
@Module({
  imports: [PrismaModule, StorageModule, LearnAccessModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
