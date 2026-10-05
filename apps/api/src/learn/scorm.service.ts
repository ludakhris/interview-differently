import { Inject, Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { LocalDiskPublicStorage } from '../storage/local-disk-storage'
import { PUBLIC_MEDIA_STORAGE, type PublicMediaStorage } from '../storage/media-storage.interface'
import { contentTypeFor, readScormZip, safePath } from './scorm-package'

const PREFIX = 'learn-scorm'
const UPLOAD_CONCURRENCY = 8

/**
 * Stores uploaded SCORM packages. Production writes to the public R2 bucket
 * (the site rewrites /scorm/* to it, so content is same-origin with the
 * player). Anywhere else files go to local disk, never the real bucket, and
 * the API serves them back in dev.
 */
@Injectable()
export class ScormService {
  constructor(
    @Inject(PUBLIC_MEDIA_STORAGE) private readonly publicStorage: PublicMediaStorage,
    private readonly local: LocalDiskPublicStorage
  ) {}

  private storage(): PublicMediaStorage {
    return process.env.NODE_ENV === 'production' ? this.publicStorage : this.local
  }

  /** Unzips, checks and stores a package. Throws a 400 for anything that is not valid SCORM. */
  async store(buffer: Buffer) {
    const pkg = readScormZip(buffer)
    const packageId = randomUUID()
    const queue = [...pkg.files.entries()]
    const storage = this.storage()
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          const [path, bytes] = next
          await storage.upload(
            `${PREFIX}/${packageId}/${path}`,
            Buffer.from(bytes),
            contentTypeFor(path)
          )
        }
      })
    )
    return {
      packageId,
      version: pkg.version,
      entry: pkg.entry,
      title: pkg.title,
      files: pkg.files.size,
    }
  }

  /** Dev only: read one stored file back. */
  async read(packageId: string, path: string): Promise<{ bytes: Buffer; type: string } | null> {
    const safe = safePath(path)
    if (!safe || !/^[0-9a-f-]{36}$/.test(packageId)) return null
    const bytes = await this.local.read(`${PREFIX}/${packageId}/${safe}`)
    return bytes ? { bytes, type: contentTypeFor(safe) } : null
  }
}
