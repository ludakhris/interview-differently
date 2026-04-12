import { Module } from '@nestjs/common'
import { ImmersiveSessionsController } from './immersive-sessions.controller'
import { ImmersiveSessionsService } from './immersive-sessions.service'
import { ImmersiveFeedbackService } from './immersive-feedback.service'

@Module({
  controllers: [ImmersiveSessionsController],
  providers: [ImmersiveSessionsService, ImmersiveFeedbackService],
})
export class ImmersiveSessionsModule {}
