import { Module } from '@nestjs/common'
import { ResultsController } from './results.controller'
import { ResultsService } from './results.service'
import { AiFeedbackService } from './ai-feedback.service'
import { LtiStoreModule } from '../lti/lti-store.module'

@Module({
  imports: [LtiStoreModule],
  controllers: [ResultsController],
  providers: [ResultsService, AiFeedbackService],
})
export class ResultsModule {}
