import { Module } from '@nestjs/common'
import { ResultsController } from './results.controller'
import { ResultsService } from './results.service'
import { AiFeedbackService } from './ai-feedback.service'

@Module({
  controllers: [ResultsController],
  providers: [ResultsService, AiFeedbackService],
})
export class ResultsModule {}
