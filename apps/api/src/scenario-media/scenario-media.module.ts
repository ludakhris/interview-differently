import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { DidModule } from '../did/did.module'
import { ScenarioMediaController } from './scenario-media.controller'
import { ScenarioMediaService } from './scenario-media.service'
import { LocalDiskMediaStorage } from './storage/local-disk-storage'
import { R2MediaStorage } from './storage/r2-storage'
import { MEDIA_STORAGE } from './storage/media-storage.interface'

@Module({
  imports: [PrismaModule, DidModule],
  controllers: [ScenarioMediaController],
  providers: [
    ScenarioMediaService,
    LocalDiskMediaStorage,
    R2MediaStorage,
    {
      // Pick storage backend at boot: R2 if R2_BUCKET is set, else local disk.
      // Local-disk MP4s are served by ScenarioMediaController's /files/* route.
      provide: MEDIA_STORAGE,
      useFactory: (local: LocalDiskMediaStorage, r2: R2MediaStorage) =>
        process.env.R2_BUCKET ? r2 : local,
      inject: [LocalDiskMediaStorage, R2MediaStorage],
    },
  ],
})
export class ScenarioMediaModule {}
