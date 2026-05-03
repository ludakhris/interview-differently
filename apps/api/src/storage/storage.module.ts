import { Module } from '@nestjs/common'
import { LocalDiskPublicStorage, LocalDiskPrivateStorage } from './local-disk-storage'
import { R2PublicStorage, R2PrivateStorage } from './r2-storage'
import { PUBLIC_MEDIA_STORAGE, PRIVATE_MEDIA_STORAGE } from './media-storage.interface'

/**
 * Provides two `MediaStorage` flavours, picked at boot from env:
 *
 *   PUBLIC_MEDIA_STORAGE  → R2PublicStorage  when R2_BUCKET is set
 *                          → LocalDiskPublicStorage  otherwise
 *
 *   PRIVATE_MEDIA_STORAGE → R2PrivateStorage when R2_RESPONSES_BUCKET is set
 *                          → LocalDiskPrivateStorage otherwise
 *
 * The two are independent — a deploy can have one in R2 and the other on
 * local disk without issue, which is useful while provisioning the second
 * bucket.
 */
@Module({
  providers: [
    LocalDiskPublicStorage,
    LocalDiskPrivateStorage,
    R2PublicStorage,
    R2PrivateStorage,
    {
      provide: PUBLIC_MEDIA_STORAGE,
      useFactory: (local: LocalDiskPublicStorage, r2: R2PublicStorage) =>
        process.env.R2_BUCKET ? r2 : local,
      inject: [LocalDiskPublicStorage, R2PublicStorage],
    },
    {
      provide: PRIVATE_MEDIA_STORAGE,
      useFactory: (local: LocalDiskPrivateStorage, r2: R2PrivateStorage) =>
        process.env.R2_RESPONSES_BUCKET ? r2 : local,
      inject: [LocalDiskPrivateStorage, R2PrivateStorage],
    },
  ],
  exports: [PUBLIC_MEDIA_STORAGE, PRIVATE_MEDIA_STORAGE, LocalDiskPublicStorage],
})
export class StorageModule {}
