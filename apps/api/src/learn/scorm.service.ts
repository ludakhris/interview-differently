import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { LocalDiskPublicStorage } from '../storage/local-disk-storage'
import { PUBLIC_MEDIA_STORAGE, type PublicMediaStorage } from '../storage/media-storage.interface'
import { contentTypeFor, readScormZip, safePath } from './scorm-package'
import { PLAYER_KEY, scormPlayerHtml } from './scorm-player'

const PREFIX = 'learn-scorm'
const UPLOAD_CONCURRENCY = 8

/**
 * Stores uploaded SCORM packages. Production writes to the public R2 bucket, served from the public media host,
 * so package code never runs on the Learn Differently origin (see scorm-player.ts). Anywhere else files go to
 * local disk, never the real bucket, and the API serves them back.
 */
@Injectable()
export class ScormService implements OnModuleInit {
  private readonly logger = new Logger(ScormService.name)

  constructor(
    @Inject(PUBLIC_MEDIA_STORAGE) private readonly publicStorage: PublicMediaStorage,
    private readonly local: LocalDiskPublicStorage
  ) {}

  private storage(): PublicMediaStorage {
    return process.env.NODE_ENV === 'production' ? this.publicStorage : this.local
  }

  /** Writes the player page next to the packages on every start, so it always matches this version. */
  async onModuleInit() {
    try {
      await this.storage().upload(
        `${PREFIX}/${PLAYER_KEY}`,
        Buffer.from(scormPlayerHtml()),
        'text/html; charset=utf-8'
      )
    } catch (err) {
      this.logger.error(`Could not store the SCORM player page: ${(err as Error).message}`)
    }
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
    const player = `${packageId}/${safe}` === PLAYER_KEY
    if (!safe || (!player && !/^[0-9a-f-]{36}$/.test(packageId))) return null
    const bytes = await this.local.read(`${PREFIX}/${packageId}/${safe}`)
    return bytes ? { bytes, type: contentTypeFor(safe) } : null
  }
}
