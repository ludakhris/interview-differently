import { Module } from '@nestjs/common'
import { ImmersiveSessionsController } from './immersive-sessions.controller'
import { ImmersiveSessionsService } from './immersive-sessions.service'
import { ImmersiveFeedbackService } from './immersive-feedback.service'
import { TranscriptionService } from '../transcription/transcription.service'
import { StorageModule } from '../storage/storage.module'
import { ConsentModule } from '../consent/consent.module'

@Module({
  imports: [StorageModule, ConsentModule],
  controllers: [ImmersiveSessionsController],
  providers: [ImmersiveSessionsService, ImmersiveFeedbackService, TranscriptionService],
})
export class ImmersiveSessionsModule {}
