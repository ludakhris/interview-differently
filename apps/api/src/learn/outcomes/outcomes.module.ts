import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { StorageModule } from '../../storage/storage.module'
import { LearnAccessModule } from '../learn-access.module'
import { OutcomesController } from './outcomes.controller'
import { OutcomesService } from './outcomes.service'

/** #69: see docs/talent-and-attendance-design.md for this feature's endpoints. */
@Module({
  imports: [PrismaModule, StorageModule, LearnAccessModule],
  controllers: [OutcomesController],
  providers: [OutcomesService],
  exports: [OutcomesService],
})
export class OutcomesModule {}
