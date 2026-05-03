import { Module } from '@nestjs/common'
import { ImmersiveSessionsController } from './immersive-sessions.controller'
import { ImmersiveSessionsService } from './immersive-sessions.service'
import { ImmersiveFeedbackService } from './immersive-feedback.service'
import { TranscriptionService } from '../transcription/transcription.service'
import { StorageModule } from '../storage/storage.module'

@Module({
  imports: [StorageModule],
  controllers: [ImmersiveSessionsController],
  providers: [ImmersiveSessionsService, ImmersiveFeedbackService, TranscriptionService],
})
export class ImmersiveSessionsModule {}
