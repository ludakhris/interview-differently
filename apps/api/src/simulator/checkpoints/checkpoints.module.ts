import { Global, Module } from '@nestjs/common'
import { PRACTICE_PORT } from '../../core/practice-port'
import { PrismaModule } from '../../prisma/prisma.module'
import { LtiStoreModule } from '../../lti/lti-store.module'
import { SqlRunnerModule } from '../sql-runner/sql-runner.module'
import { CheckpointChatService } from './checkpoint-chat.service'
import { CheckpointsService } from './checkpoints.service'
import { StandaloneCheckpointController } from './standalone-checkpoint.controller'
import { StandaloneCheckpointService } from './standalone-checkpoint.service'

/**
 * Global so the LMS can inject the port by its token without importing anything from the Simulator. The chat service
 * is also exported for the Simulator's own LTI tool, which serves the checkpoint page. Standalone Interview Differently
 * serves the same chat to a signed-in learner here (`me/checkpoints`).
 */
@Global()
@Module({
  imports: [PrismaModule, SqlRunnerModule, LtiStoreModule],
  controllers: [StandaloneCheckpointController],
  providers: [
    CheckpointsService,
    CheckpointChatService,
    StandaloneCheckpointService,
    { provide: PRACTICE_PORT, useExisting: CheckpointChatService },
  ],
  exports: [PRACTICE_PORT, CheckpointChatService, CheckpointsService],
})
export class CheckpointsModule {}
