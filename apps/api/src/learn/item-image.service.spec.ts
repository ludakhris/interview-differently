import { BadRequestException } from '@nestjs/common'
import type { LocalDiskPublicStorage } from '../storage/local-disk-storage'
import type { PublicMediaStorage } from '../storage/media-storage.interface'
import { ItemImageService } from './item-image.service'
import { MAX_IMAGE_BYTES } from './item-image'

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
])
const upload = jest.fn()
const publicUpload = jest.fn()
const service = new ItemImageService(
  { upload: publicUpload } as unknown as PublicMediaStorage,
  { upload } as unknown as LocalDiskPublicStorage
)

beforeEach(() => jest.resetAllMocks())

describe('ItemImageService', () => {
  it('stores a valid image under a generated key, on local disk outside production', async () => {
    const key = await service.store(PNG)
    expect(key).toMatch(/^learn-images\/[0-9a-f-]{36}\.png$/)
    expect(upload).toHaveBeenCalledWith(key, PNG, 'image/png')
    expect(publicUpload).not.toHaveBeenCalled()
  })

  it('writes to the public bucket in production', async () => {
    const env = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await service.store(PNG)
      expect(publicUpload).toHaveBeenCalled()
      expect(upload).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = env
    }
  })

  it('rejects a file that is not a PNG, JPEG or WebP, whatever it is called', async () => {
    await expect(service.store(Buffer.from('<svg><script/></svg>'))).rejects.toThrow(
      BadRequestException
    )
    expect(upload).not.toHaveBeenCalled()
  })

  it('rejects an image over 2 MB', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)])
    await expect(service.store(big)).rejects.toThrow(BadRequestException)
    expect(upload).not.toHaveBeenCalled()
  })
})
