import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { LocalDiskPublicStorage } from '../storage/local-disk-storage'
import { PUBLIC_MEDIA_STORAGE, type PublicMediaStorage } from '../storage/media-storage.interface'
import { MAX_IMAGE_BYTES, sniffImage } from './item-image'

/**
 * Stores preview images. Production writes to the public bucket; anywhere else
 * files go to local disk, never the real bucket.
 */
@Injectable()
export class ItemImageService {
  constructor(
    @Inject(PUBLIC_MEDIA_STORAGE) private readonly publicStorage: PublicMediaStorage,
    private readonly local: LocalDiskPublicStorage
  ) {}

  /** Checks the file by its own bytes, stores it and returns its key. */
  async store(buffer: Buffer): Promise<string> {
    if (buffer.length > MAX_IMAGE_BYTES)
      throw new BadRequestException('The image is too large (max 2 MB).')
    const image = sniffImage(buffer)
    if (!image) throw new BadRequestException('Use a PNG, JPEG or WebP image.')
    const key = `learn-images/${randomUUID()}.${image.ext}`
    const storage = process.env.NODE_ENV === 'production' ? this.publicStorage : this.local
    await storage.upload(key, buffer, image.type)
    return key
  }
}
