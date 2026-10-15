import { Module } from '@nestjs/common'
import { InterviewEngineService } from './interview-engine.service'

@Module({
  providers: [InterviewEngineService],
  exports: [InterviewEngineService],
})
export class InterviewEngineModule {}
