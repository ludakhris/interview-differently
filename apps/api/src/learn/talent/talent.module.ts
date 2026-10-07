import { Module, forwardRef } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { StorageModule } from '../../storage/storage.module'
import { LearnAccessModule } from '../learn-access.module'
import { LearnModule } from '../learn.module'
import { ParticipantNotesController } from './participant-notes.controller'
import { ParticipantNotesService } from './participant-notes.service'
import { TalentController } from './talent.controller'
import { TalentService } from './talent.service'

/** #69: see docs/talent-and-attendance-design.md for this feature's endpoints. */
@Module({
  imports: [PrismaModule, StorageModule, LearnAccessModule, forwardRef(() => LearnModule)],
  controllers: [TalentController, ParticipantNotesController],
  providers: [TalentService, ParticipantNotesService],
  exports: [TalentService],
})
export class TalentModule {}
