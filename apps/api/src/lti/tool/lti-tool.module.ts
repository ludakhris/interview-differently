import { Module } from '@nestjs/common'
import { InterviewEngineModule } from '../../interview-engine/interview-engine.module'
import { PrismaModule } from '../../prisma/prisma.module'
import { LtiStoreModule } from '../lti-store.module'
import { LtiToolController } from './lti-tool.controller'
import { LtiToolService } from './lti-tool.service'

/** Interview Differently as an LTI 1.3 tool (#63). */
@Module({
  imports: [PrismaModule, LtiStoreModule, InterviewEngineModule],
  controllers: [LtiToolController],
  providers: [LtiToolService],
})
export class LtiToolModule {}
