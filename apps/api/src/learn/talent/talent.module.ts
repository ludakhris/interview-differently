import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { StorageModule } from '../../storage/storage.module'
import { LearnAccessModule } from '../learn-access.module'
import { TalentController } from './talent.controller'
import { TalentService } from './talent.service'

/** #69: see docs/talent-and-attendance-design.md for this feature's endpoints. */
@Module({
  imports: [PrismaModule, StorageModule, LearnAccessModule],
  controllers: [TalentController],
  providers: [TalentService],
  exports: [TalentService],
})
export class TalentModule {}
